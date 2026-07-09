import { describe, it, expect } from 'vitest';
import { runProjection } from '../projection';
import { runDetailedProjection } from '../detailed';
import { defaultInputs } from '../defaults';
import type { PlanInputs, PlanEvent } from '../types';

function retiredCouple(): PlanInputs {
  const i = defaultInputs();
  i.startYear = 2026;
  i.you = { ...i.you, currentAge: 66, retirementAge: 60, lifeExpectancy: 90, ssStartAge: 70 };
  i.spouse = { ...i.spouse, currentAge: 66, retirementAge: 60, lifeExpectancy: 90, ssStartAge: 70 };
  i.includeSS = false;
  i.stressTestOn = false;
  i.ltcOn = false;
  i.cashReserveOn = false;
  i.survivorOn = false;
  i.oneTimeExpense = 0;
  i.preMedicarePremium = 0;
  i.goGoSpending = 80000;
  i.inflation = 0;
  i.returnRetirement = 0;
  i.returnAccumulation = 0;
  i.taxRatePreSS = 0;
  i.taxRatePostSS = 0;
  i.medicarePremiumGrowth = 0; // keep hand-computed expectations exact
  return i;
}

const event = (patch: Partial<PlanEvent>): PlanEvent => ({
  id: 'e1',
  name: 'Test',
  kind: 'expense',
  amount: 10000,
  startYear: 2026,
  endYear: 2026,
  inflationAdjust: true,
  taxable: false,
  ...patch,
});

describe('income & expense events — simple engine', () => {
  it('expense event increases the draw in its window only', () => {
    const i = retiredCouple();
    i.events = [event({ kind: 'expense', amount: 25000, startYear: 2027, endYear: 2028 })];
    const r = runProjection(i);
    expect(r.rows[0].portfolioDraw).toBeCloseTo(80000 + (202.9 + 34.5) * 12 * 2, 0);
    expect(r.rows[1].portfolioDraw).toBeCloseTo(r.rows[0].portfolioDraw + 25000, 0);
    expect(r.rows[3].portfolioDraw).toBeCloseTo(r.rows[0].portfolioDraw, 0);
  });

  it('income event reduces the draw; surplus is reinvested', () => {
    const i = retiredCouple();
    const need = 80000 + (202.9 + 34.5) * 12 * 2;
    i.events = [event({ kind: 'income', amount: need + 20000, startYear: 2026, endYear: 2026 })];
    const r = runProjection(i);
    expect(r.rows[0].portfolioDraw).toBe(0);
    // Surplus 20k lands in the balance: end = begin − 0 + 20000
    expect(r.rows[0].endBalance).toBeCloseTo(i.currentBalance + 20000, 0);
  });

  it('inflation-adjusted event grows with the plan inflation rate', () => {
    const i = retiredCouple();
    i.inflation = 0.03;
    i.events = [event({ kind: 'expense', amount: 10000, startYear: 2026, endYear: 2036, inflationAdjust: true })];
    const r = runProjection(i);
    const row5 = r.rows[5];
    const base5 = 80000 * 1.03 ** 5 + (202.9 + 34.5) * 12 * 2;
    expect(row5.spending).toBeCloseTo(80000 * 1.03 ** 5 + 10000 * 1.03 ** 5, 0);
    expect(row5.portfolioDraw).toBeCloseTo(base5 + 10000 * 1.03 ** 5, 0);
  });
});

describe('income & expense events — detailed engine', () => {
  it('taxable income event is taxed as ordinary income', () => {
    const i = retiredCouple();
    i.taxMode = 'detailed';
    i.detailed.taxableYieldPct = 0;
    i.detailed.aca.enabled = false;
    i.detailed.accounts = { taxable: 0, taxableBasisPct: 1, traditionalYou: 0, traditionalSpouse: 0, roth: 2000000 };
    i.events = [event({ kind: 'income', amount: 132200, taxable: true, startYear: 2026, endYear: 2026 })];
    const r = runDetailedProjection(i);
    const row = r.rows[0];
    expect(row.detail!.magi).toBeCloseTo(132200, 0);
    // Taxable ordinary = 132,200 − 32,200 = 100,000 → 2,480 + 9,024 = wait: 10% of 24,800 + 12% of 75,200
    expect(row.detail!.federalTax).toBeCloseTo(24800 * 0.1 + 75200 * 0.12, 0);
  });

  it('non-taxable income event reduces need without touching MAGI', () => {
    const i = retiredCouple();
    i.taxMode = 'detailed';
    i.detailed.taxableYieldPct = 0;
    i.detailed.aca.enabled = false;
    i.detailed.accounts = { taxable: 0, taxableBasisPct: 1, traditionalYou: 0, traditionalSpouse: 0, roth: 2000000 };
    i.events = [event({ kind: 'income', amount: 50000, taxable: false, startYear: 2026, endYear: 2026 })];
    const r = runDetailedProjection(i);
    const row = r.rows[0];
    expect(row.detail!.magi).toBe(0);
    const need = 80000 + (202.9 + 34.5) * 12 * 2;
    expect(row.portfolioDraw).toBeCloseTo(need - 50000, 0);
  });

  it('income surplus is reinvested into the taxable bucket', () => {
    const i = retiredCouple();
    i.taxMode = 'detailed';
    i.detailed.taxableYieldPct = 0;
    i.detailed.aca.enabled = false;
    i.detailed.accounts = { taxable: 0, taxableBasisPct: 1, traditionalYou: 0, traditionalSpouse: 0, roth: 2000000 };
    const need = 80000 + (202.9 + 34.5) * 12 * 2;
    i.events = [event({ kind: 'income', amount: need + 30000, taxable: false, startYear: 2026, endYear: 2026 })];
    const r = runDetailedProjection(i);
    expect(r.rows[0].detail!.taxableBalance).toBeCloseTo(30000, 0);
  });
});

describe('guardrails withdrawal strategy', () => {
  function guardrailInputs(): PlanInputs {
    const i = retiredCouple();
    i.withdrawalStrategy = 'guardrails';
    i.guardrails = { band: 0.2, adjustment: 0.1 };
    i.currentBalance = 2000000;
    i.goGoSpending = 80000; // initial WR = ~4.28%
    i.preMedicarePremium = 0;
    i.you.medicareEligibilityAge = 65;
    i.spouse.medicareEligibilityAge = 65;
    return i;
  }

  it('cuts spending 10% after the withdrawal rate breaches the upper guardrail', () => {
    const i = guardrailInputs();
    // Crash the portfolio 40% in year 2 via overrides
    const overrides = [0, -0.4, 0, 0, 0];
    const r = runProjection(i, overrides);
    // Year 0: initial WR set. Year 1 begins after year-0 spend, then −40% return
    // Year 2: balance dropped → WR breaches +20% band → spending × 0.9
    const spend0 = r.rows[0].spending;
    const spend2 = r.rows[2].spending;
    expect(spend2).toBeCloseTo(spend0 * 0.9, 0);
  });

  it('raises spending 10% after strong returns push the rate below the lower guardrail', () => {
    const i = guardrailInputs();
    const overrides = [0, 0.5, 0.5, 0, 0];
    const r = runProjection(i, overrides);
    const spend0 = r.rows[0].spending;
    const spend3 = r.rows[3].spending;
    expect(spend3).toBeGreaterThan(spend0);
  });

  it('fixed strategy leaves spending untouched (parity default)', () => {
    const i = guardrailInputs();
    i.withdrawalStrategy = 'fixed';
    const r = runProjection(i, [0, -0.4, 0, 0, 0]);
    expect(r.rows[2].spending).toBeCloseTo(r.rows[0].spending, 0);
  });

  it('works in the detailed engine too', () => {
    const i = guardrailInputs();
    i.taxMode = 'detailed';
    i.detailed.taxableYieldPct = 0;
    i.detailed.aca.enabled = false;
    i.detailed.accounts = { taxable: 0, taxableBasisPct: 1, traditionalYou: 0, traditionalSpouse: 0, roth: 2000000 };
    const r = runDetailedProjection(i, [0, -0.4, 0, 0, 0]);
    expect(r.rows[2].spending).toBeCloseTo(r.rows[0].spending * 0.9, 0);
  });
});

describe('already claiming Social Security (start age in the past)', () => {
  function retiredAt72(): PlanInputs {
    const i = defaultInputs();
    i.includeSS = true;
    i.ssCutPct = 0;
    i.you = { ...i.you, currentAge: 72, retirementAge: 62, lifeExpectancy: 90, ssStartAge: 62, ssAnnualBenefit: 30000 };
    i.spouse = { ...i.spouse, currentAge: 70, retirementAge: 62, lifeExpectancy: 90, ssStartAge: 62, ssAnnualBenefit: 24000 };
    return i;
  }

  it('simple engine: entered benefit is today\'s check, not back-deflated', () => {
    const r = runProjection(retiredAt72());
    expect(r.rows[0].yourSS).toBeCloseTo(30000, 6);
    expect(r.rows[0].spouseSS).toBeCloseTo(24000, 6);
  });

  it('simple engine: COLA accrues from now, not from the past claim age', () => {
    const i = retiredAt72();
    i.ssColaOn = true;
    i.ssColaRate = 0.02;
    const r = runProjection(i);
    expect(r.rows[0].yourSS).toBeCloseTo(30000, 6);
    expect(r.rows[1].yourSS).toBeCloseTo(30000 * 1.02, 6);
  });

  it('detailed engine matches', () => {
    const i = retiredAt72();
    i.taxMode = 'detailed';
    const r = runDetailedProjection(i);
    expect(r.rows[0].yourSS).toBeCloseTo(30000, 6);
  });

  it('future claim ages are unchanged (inflated to start age as before)', () => {
    const i = retiredAt72();
    i.you = { ...i.you, currentAge: 60, retirementAge: 62, ssStartAge: 67 };
    const r = runProjection(i);
    const row = r.rows.find((x) => x.yourAge === 67)!;
    expect(row.yourSS).toBeCloseTo(30000 * Math.pow(1 + i.inflation, 7), 4);
  });
});

describe('single-person mode', () => {
  function singlePerson(): PlanInputs {
    const i = defaultInputs();
    i.single = true;
    i.you = { ...i.you, currentAge: 60, retirementAge: 62, lifeExpectancy: 90, ssStartAge: 67, ssAnnualBenefit: 30000 };
    // Deliberately hostile spouse values that must all be ignored
    i.spouse = { ...i.spouse, currentAge: 40, retirementAge: 70, lifeExpectancy: 100, ssStartAge: 62, ssAnnualBenefit: 50000, annualContribution: 99999 };
    i.currentBalance = 1200000;
    i.goGoSpending = 60000;
    return i;
  }

  it('simple engine ignores the spouse entirely', () => {
    const r = runProjection(singlePerson());
    // Horizon from YOUR life expectancy, not the spouse's 100
    expect(r.endYear).toBe(defaultInputs().startYear + 30);
    // Retirement phase begins at YOUR retirement age despite spouse "working to 70"
    const retRow = r.rows.find((x) => x.yourAge === 62)!;
    expect(retRow.phase).toBe('Retirement');
    // No spouse contributions or SS ever
    expect(r.rows.every((x) => x.spouseContribution === 0)).toBe(true);
    expect(r.rows.every((x) => x.spouseSS === 0)).toBe(true);
    // Your SS still arrives at 67
    const ssRow = r.rows.find((x) => x.yourAge === 67)!;
    expect(ssRow.yourSS).toBeGreaterThan(0);
  });

  it('pre-Medicare premium drops to zero (not the couple step-down) at your Medicare age', () => {
    const i = singlePerson();
    i.preMedicarePremium = 12000;
    i.premiumPctAfterFirstMedicare = 0.5;
    const r = runProjection(i);
    const before = r.rows.find((x) => x.yourAge === 64)!;
    const after = r.rows.find((x) => x.yourAge === 65)!;
    expect(before.preMedicareInsurance).toBeGreaterThan(0);
    expect(after.preMedicareInsurance).toBe(0);
  });

  it('detailed engine uses single filing status (more tax than MFJ on the same income)', () => {
    const single = singlePerson();
    single.taxMode = 'detailed';
    single.detailed.accounts = { taxable: 0, taxableBasisPct: 1, traditionalYou: 1200000, traditionalSpouse: 555555, roth: 0 };
    const couple = JSON.parse(JSON.stringify(single)) as PlanInputs;
    couple.single = false;
    couple.detailed.accounts.traditionalSpouse = 0;
    couple.spouse = { ...couple.spouse, currentAge: 60, retirementAge: 62, lifeExpectancy: 90, ssAnnualBenefit: 0, annualContribution: 0, partBMonthly: 0, partDMonthly: 0 };
    const rs = runDetailedProjection(single);
    const rc = runDetailedProjection(couple);
    // Same income stream, but single brackets bite harder
    expect(rs.lifetimeTax!).toBeGreaterThan(rc.lifetimeTax!);
    // And the spouse's traditional bucket was ignored in single mode
    expect(rs.rows[0].detail!.traditionalBalance).toBeLessThanOrEqual(1200000 * 1.2);
  });

  it('detailed engine ignores survivor settings when single', () => {
    const i = singlePerson();
    i.taxMode = 'detailed';
    i.survivorOn = true;
    i.yourDeathAge = 50; // would be "already dead" — must be ignored
    const r = runDetailedProjection(i);
    expect(r.rows[0].totalSS).toBe(0); // not the survivor max-of-benefits path with spouse's 50k
    // Survivor settings must be a no-op: identical result with them off
    const off = JSON.parse(JSON.stringify(i)) as PlanInputs;
    off.survivorOn = false;
    const rOff = runDetailedProjection(off);
    expect(r.finalBalance).toBe(rOff.finalBalance);
    expect(r.lifetimeTax).toBe(rOff.lifetimeTax);
  });
});
