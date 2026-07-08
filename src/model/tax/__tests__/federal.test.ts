import { describe, it, expect } from 'vitest';
import { ordinaryTax, ltcgTax, taxableSocialSecurity, niit, householdTax, acaSubsidy, irmaaAnnualSurcharge } from '../federal';
import { FPL_HOUSEHOLD_2 } from '../constants';

const close = (a: number, b: number, tol = 0.5) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('ordinary tax (2026 MFJ, indexFactor 1)', () => {
  it('taxes within the 10% bracket', () => {
    close(ordinaryTax(20000, 'mfj', 1), 2000);
  });
  it('crosses brackets correctly at $150k taxable', () => {
    // 24,800*10% + (100,800-24,800)*12% + (150,000-100,800)*22%
    close(ordinaryTax(150000, 'mfj', 1), 2480 + 9120 + 10824);
  });
  it('zero on zero', () => {
    expect(ordinaryTax(0, 'mfj', 1)).toBe(0);
  });
  it('scales thresholds with the index factor', () => {
    // Doubling thresholds halves the effective rate at a given income
    expect(ordinaryTax(49600, 'mfj', 2)).toBeCloseTo(4960, 0);
  });
});

describe('LTCG stacking', () => {
  it('gains fully inside the 0% window are untaxed', () => {
    expect(ltcgTax(20000, 50000, 'mfj', 1)).toBe(0);
  });
  it('gains straddling the 0/15 boundary are taxed only above it', () => {
    // ordinary 80,000; gains 40,000 → 0% up to 99,050, 15% on the rest
    close(ltcgTax(80000, 40000, 'mfj', 1), (80000 + 40000 - 99050) * 0.15);
  });
  it('high ordinary income pushes all gains to 15%', () => {
    close(ltcgTax(200000, 10000, 'mfj', 1), 1500);
  });
});

describe('Social Security taxability', () => {
  it('none below tier 1', () => {
    expect(taxableSocialSecurity(30000, 10000, 'mfj')).toBe(0); // provisional 25k < 32k
  });
  it('50% band between tiers', () => {
    // provisional = 30000 + 15000 = 45000? no — otherIncome 30k + half SS 10k = 40k (32–44k band)
    close(taxableSocialSecurity(20000, 30000, 'mfj'), 0.5 * (40000 - 32000));
  });
  it('caps at 85% of the benefit', () => {
    close(taxableSocialSecurity(40000, 200000, 'mfj'), 34000);
  });
});

describe('NIIT', () => {
  it('applies 3.8% to investment income above the MAGI threshold', () => {
    close(niit(50000, 280000, 'mfj'), 0.038 * 30000);
    close(niit(50000, 400000, 'mfj'), 0.038 * 50000);
    expect(niit(50000, 200000, 'mfj')).toBe(0);
  });
});

describe('household tax', () => {
  it('standard deduction wipes out small ordinary income', () => {
    const r = householdTax({ ordinaryIncome: 30000, investmentIncome: 0, ssBenefit: 0, status: 'mfj', indexFactor: 1, stateRate: 0 });
    expect(r.federal).toBe(0); // 30,000 < 32,200 deduction
    expect(r.agi).toBe(30000);
  });
  it('excess deduction shelters investment income', () => {
    const r = householdTax({ ordinaryIncome: 0, investmentIncome: 90000, ssBenefit: 0, status: 'mfj', indexFactor: 1, stateRate: 0 });
    // 90,000 - 32,200 = 57,800 gains, all inside the 0% LTCG window
    expect(r.federal).toBe(0);
  });
  it('applies flat state rate net of deduction', () => {
    const r = householdTax({ ordinaryIncome: 132200, investmentIncome: 0, ssBenefit: 0, status: 'mfj', indexFactor: 1, stateRate: 0.05 });
    close(r.state, 0.05 * 100000);
  });
});

describe('ACA subsidy', () => {
  const fpl = FPL_HOUSEHOLD_2; // 21,150
  it('cliff rules: no subsidy above 400% FPL', () => {
    expect(acaSubsidy(fpl * 4.01, 30000, fpl, 'cliff')).toBe(0);
  });
  it('cliff rules: subsidy just below the cliff', () => {
    const magi = fpl * 3.99;
    close(acaSubsidy(magi, 30000, fpl, 'cliff'), 30000 - 0.0996 * magi, 30);
  });
  it('enhanced rules: 8.5% cap with no cliff', () => {
    const magi = fpl * 6;
    close(acaSubsidy(magi, 30000, fpl, 'enhanced'), 30000 - 0.085 * magi, 1);
  });
  it('full benchmark premium when contribution exceeds premium', () => {
    expect(acaSubsidy(1000000, 30000, fpl, 'enhanced')).toBe(0);
  });
});

describe('IRMAA', () => {
  it('tier 0 below the first threshold', () => {
    expect(irmaaAnnualSurcharge(200000, 'mfj', 1)).toEqual({ tier: 0, annualSurcharge: 0 });
  });
  it('tier 1 between 218k and 274k (MFJ)', () => {
    const r = irmaaAnnualSurcharge(250000, 'mfj', 1);
    expect(r.tier).toBe(1);
    close(r.annualSurcharge, (81.2 + 14.5) * 12);
  });
  it('top tier above 750k', () => {
    const r = irmaaAnnualSurcharge(900000, 'mfj', 1);
    expect(r.tier).toBe(5);
    close(r.annualSurcharge, (487 + 91) * 12);
  });
  it('single thresholds are lower', () => {
    expect(irmaaAnnualSurcharge(120000, 'single', 1).tier).toBe(1);
    expect(irmaaAnnualSurcharge(120000, 'mfj', 1).tier).toBe(0);
  });
});
