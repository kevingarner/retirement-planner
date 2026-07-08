import { describe, it, expect } from 'vitest';
import { runDetailedProjection } from '../detailed';
import { defaultInputs } from '../defaults';
import type { PlanInputs } from '../types';

// A clean baseline: retired couple, no SS, no toggles, everything already in retirement
function base(): PlanInputs {
  const i = defaultInputs();
  i.startYear = 2026;
  i.taxMode = 'detailed';
  i.you = { ...i.you, currentAge: 66, retirementAge: 60, lifeExpectancy: 90, ssStartAge: 70 };
  i.spouse = { ...i.spouse, currentAge: 66, retirementAge: 60, lifeExpectancy: 90, ssStartAge: 70 };
  i.includeSS = false;
  i.stressTestOn = false;
  i.ltcOn = false;
  i.cashReserveOn = false;
  i.survivorOn = false;
  i.oneTimeExpense = 0;
  i.preMedicarePremium = 0; // both on Medicare at 66
  i.goGoSpending = 80000;
  i.inflation = 0; // zero inflation makes hand-verification exact
  i.returnRetirement = 0;
  i.returnAccumulation = 0;
  i.detailed.taxableYieldPct = 0;
  i.detailed.stateTaxRate = 0;
  i.detailed.aca.enabled = false;
  return i;
}

describe('detailed engine — bucket mechanics', () => {
  it('draws Roth only → zero tax', () => {
    const i = base();
    i.detailed.accounts = { taxable: 0, taxableBasisPct: 1, traditionalYou: 0, traditionalSpouse: 0, roth: 3000000 };
    const r = runDetailedProjection(i);
    const row = r.rows[0];
    expect(row.estimatedTaxes).toBe(0);
    expect(row.detail!.magi).toBe(0);
    // Draw = spending + Medicare base premiums only
    const medicareBase = (202.9 + 34.5) * 12 * 2;
    expect(row.portfolioDraw).toBeCloseTo(80000 + medicareBase, 0);
  });

  it('taxable with full basis → withdrawals realize no gains, no tax', () => {
    const i = base();
    i.detailed.accounts = { taxable: 3000000, taxableBasisPct: 1, traditionalYou: 0, traditionalSpouse: 0, roth: 0 };
    const r = runDetailedProjection(i);
    expect(r.rows[0].estimatedTaxes).toBe(0);
    expect(r.rows[0].detail!.federalTax).toBe(0);
  });

  it('traditional-only draws pay ordinary tax with gross-up covered', () => {
    const i = base();
    i.detailed.accounts = { taxable: 0, taxableBasisPct: 1, traditionalYou: 1500000, traditionalSpouse: 1500000, roth: 0 };
    const r = runDetailedProjection(i);
    const row = r.rows[0];
    const medicareBase = (202.9 + 34.5) * 12 * 2;
    const need = 80000 + medicareBase;
    // Draw covers spending + tax; tax is on the draw itself (fixed point)
    expect(row.portfolioDraw).toBeGreaterThan(need);
    expect(row.estimatedTaxes).toBeGreaterThan(0);
    // Self-consistency: draw − taxes = cash need
    expect(row.portfolioDraw - row.estimatedTaxes).toBeCloseTo(need, 0);
    // Sanity: MFJ effective rate on ~$95k ordinary net of $32.2k deduction ≈ 8%
    expect(row.estimatedTaxes / row.portfolioDraw).toBeGreaterThan(0.05);
    expect(row.estimatedTaxes / row.portfolioDraw).toBeLessThan(0.15);
  });

  it('conserves money: end balance = begin + growth + contribs − draws (no-tax case)', () => {
    const i = base();
    i.detailed.accounts = { taxable: 0, taxableBasisPct: 1, traditionalYou: 0, traditionalSpouse: 0, roth: 2000000 };
    const r = runDetailedProjection(i);
    const row = r.rows[0];
    expect(row.endBalance).toBeCloseTo(row.beginBalance - row.portfolioDraw, 0);
  });
});

describe('detailed engine — RMDs', () => {
  it('forces RMD at the start age and reinvests the excess', () => {
    const i = base();
    i.goGoSpending = 10000; // tiny spending so RMD exceeds need
    i.you.currentAge = 75;
    i.spouse.currentAge = 75;
    i.detailed.rmdStartAgeYou = 75;
    i.detailed.rmdStartAgeSpouse = 75;
    i.detailed.accounts = { taxable: 0, taxableBasisPct: 1, traditionalYou: 1230000, traditionalSpouse: 0, roth: 0 };
    const r = runDetailedProjection(i);
    const row = r.rows[0];
    // Uniform lifetime factor at 75 = 24.6 → RMD = 1,230,000/24.6 = 50,000
    expect(row.detail!.rmd).toBeCloseTo(50000, 0);
    // Excess above cash need lands in taxable
    expect(row.detail!.taxableBalance).toBeGreaterThan(0);
    // MAGI reflects the full RMD as ordinary income
    expect(row.detail!.magi).toBeCloseTo(50000, 0);
  });

  it('no RMD before the start age', () => {
    const i = base(); // age 66
    i.detailed.accounts = { taxable: 500000, taxableBasisPct: 1, traditionalYou: 1000000, traditionalSpouse: 1000000, roth: 0 };
    const r = runDetailedProjection(i);
    expect(r.rows[0].detail!.rmd).toBe(0);
  });
});

describe('detailed engine — Roth conversions', () => {
  it('fillBracket converts up to the bracket top plus deduction', () => {
    const i = base();
    i.goGoSpending = 20000;
    i.detailed.accounts = { taxable: 2000000, taxableBasisPct: 1, traditionalYou: 1000000, traditionalSpouse: 1000000, roth: 0 };
    i.detailed.rothConversion = { mode: 'fillBracket', amount: 0, bracketTop: 0.12, startYear: 2026, endYear: 2030 };
    const r = runDetailedProjection(i);
    const row = r.rows[0];
    // Target ordinary income = 12% bracket top (100,800) + standard deduction (32,200)
    expect(row.detail!.rothConversion).toBeCloseTo(133000, 0);
    // Conversion moved into Roth
    expect(row.detail!.rothBalance).toBeCloseTo(133000, 0);
    // Conversion stops outside the window
    const row2031 = r.rows.find((x) => x.year === 2031)!;
    expect(row2031.detail!.rothConversion).toBe(0);
  });

  it('fixed conversion inflates with the plan inflation rate', () => {
    const i = base();
    i.inflation = 0.03;
    i.detailed.accounts = { taxable: 2000000, taxableBasisPct: 1, traditionalYou: 1000000, traditionalSpouse: 1000000, roth: 0 };
    i.detailed.rothConversion = { mode: 'fixed', amount: 50000, bracketTop: 0.12, startYear: 2026, endYear: 2040 };
    const r = runDetailedProjection(i);
    expect(r.rows[0].detail!.rothConversion).toBeCloseTo(50000, 0);
    expect(r.rows[3].detail!.rothConversion).toBeCloseTo(50000 * 1.03 ** 3, 0);
  });
});

describe('detailed engine — ACA and IRMAA', () => {
  it('ACA subsidy reduces the pre-Medicare premium when MAGI is low', () => {
    const i = base();
    i.you = { ...i.you, currentAge: 55, retirementAge: 54 };
    i.spouse = { ...i.spouse, currentAge: 55, retirementAge: 54 };
    i.preMedicarePremium = 30000;
    i.detailed.aca = { enabled: true, rules: 'cliff' };
    // All spending from Roth → MAGI 0 → maximum subsidy
    i.detailed.accounts = { taxable: 0, taxableBasisPct: 1, traditionalYou: 0, traditionalSpouse: 0, roth: 3000000 };
    const r = runDetailedProjection(i);
    const row = r.rows[0];
    expect(row.detail!.acaSubsidy).toBeGreaterThan(25000);
    expect(row.preMedicareInsurance).toBeLessThan(5000);
  });

  it('no subsidy above the 400% FPL cliff', () => {
    const i = base();
    i.you = { ...i.you, currentAge: 55, retirementAge: 54 };
    i.spouse = { ...i.spouse, currentAge: 55, retirementAge: 54 };
    i.preMedicarePremium = 30000;
    i.goGoSpending = 200000;
    i.detailed.aca = { enabled: true, rules: 'cliff' };
    i.detailed.accounts = { taxable: 0, taxableBasisPct: 1, traditionalYou: 3000000, traditionalSpouse: 3000000, roth: 0 };
    const r = runDetailedProjection(i);
    const row = r.rows[0];
    // MAGI ≈ 250k+ ordinary — way past 4 × 21,150
    expect(row.detail!.acaSubsidy).toBe(0);
    expect(row.preMedicareInsurance).toBeCloseTo(30000, 0);
  });

  it('IRMAA surcharge applies from lookback MAGI', () => {
    const i = base();
    i.goGoSpending = 300000; // forces MAGI into IRMAA tiers
    i.detailed.accounts = { taxable: 0, taxableBasisPct: 1, traditionalYou: 4000000, traditionalSpouse: 4000000, roth: 0 };
    const r = runDetailedProjection(i);
    const row = r.rows[2]; // lookback now uses year 0's high MAGI
    expect(row.detail!.irmaaTier).toBeGreaterThan(0);
    expect(row.detail!.irmaaSurcharge).toBeGreaterThan(0);
    expect(row.medicare).toBeGreaterThan((202.9 + 34.5) * 12 * 2);
  });
});

describe('detailed engine — result summaries', () => {
  it('reports lifetime tax, ACA subsidy, and after-tax estate', () => {
    const i = base();
    i.detailed.accounts = { taxable: 1000000, taxableBasisPct: 0.5, traditionalYou: 1000000, traditionalSpouse: 1000000, roth: 500000 };
    const r = runDetailedProjection(i);
    expect(r.lifetimeTax).toBeGreaterThan(0);
    expect(r.afterTaxEstate).toBeDefined();
    const last = r.rows[r.rows.length - 1].detail!;
    const expected = last.taxableBalance + last.rothBalance + last.traditionalBalance * (1 - 0.25);
    expect(r.afterTaxEstate).toBeCloseTo(expected, 0);
  });

  it('supports Monte Carlo return overrides', () => {
    const i = base();
    const r = runDetailedProjection(i, [0.5, 0.5]);
    expect(r.rows[0].rateOfReturn).toBe(0.5);
    expect(r.rows[2].rateOfReturn).toBe(i.returnRetirement);
  });

  it('marks shortfall when all buckets are exhausted', () => {
    const i = base();
    i.goGoSpending = 500000;
    i.detailed.accounts = { taxable: 100000, taxableBasisPct: 1, traditionalYou: 100000, traditionalSpouse: 0, roth: 100000 };
    const r = runDetailedProjection(i);
    expect(r.runsOut).toBe(true);
    expect(r.runOutYear).toBe(2026);
  });
});

describe('detailed engine — cash reserve', () => {
  it('reserve slice earns the cash yield instead of the portfolio return', () => {
    const i = base();
    i.detailed.accounts = { taxable: 3000000, taxableBasisPct: 1, traditionalYou: 0, traditionalSpouse: 0, roth: 0 };
    i.cashReserveOn = true;
    i.cashReserveYears = 2;
    i.cashReserveYield = 0.03;
    const r = runDetailedProjection(i);
    const row = r.rows[0];
    const medicareBase = (202.9 + 34.5) * 12 * 2;
    const draw = 80000 + medicareBase;
    // Reserve = 2 years of draw, reported on the row
    expect(row.cashReserve).toBeCloseTo(2 * draw, 0);
    // With portfolio return 0, the reserve adds exactly reserve × yield
    expect(row.endBalance).toBeCloseTo(row.beginBalance - draw + 2 * draw * 0.03, 0);
  });

  it('is a drag when the cash yield is below the portfolio return', () => {
    const on = base();
    on.detailed.accounts = { taxable: 3000000, taxableBasisPct: 1, traditionalYou: 0, traditionalSpouse: 0, roth: 0 };
    on.returnRetirement = 0.05;
    on.cashReserveOn = true;
    on.cashReserveYears = 2;
    on.cashReserveYield = 0.03;
    const off = JSON.parse(JSON.stringify(on)) as PlanInputs;
    off.cashReserveOn = false;
    expect(runDetailedProjection(on).finalBalance).toBeLessThan(runDetailedProjection(off).finalBalance);
  });

  it('caps the reserve at the taxable balance', () => {
    const i = base();
    i.detailed.accounts = { taxable: 1000, taxableBasisPct: 1, traditionalYou: 0, traditionalSpouse: 0, roth: 3000000 };
    i.cashReserveOn = true;
    i.cashReserveYears = 2;
    i.cashReserveYield = 0.03;
    const r = runDetailedProjection(i);
    expect(r.rows[0].cashReserve).toBeLessThanOrEqual(1000);
  });
});
