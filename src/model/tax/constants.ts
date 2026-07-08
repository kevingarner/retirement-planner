// US federal tax parameters, 2026 baseline (TCJA rates made permanent by the
// 2025 reconciliation act). Approximate inflation-indexed values; bracket
// thresholds are inflated forward from BASE_YEAR at the plan's inflation rate.

export const BASE_YEAR = 2026;

export type FilingStatus = 'mfj' | 'single';

export interface Bracket {
  rate: number;
  upTo: number; // taxable income ceiling for this rate (Infinity for top)
}

export const ORDINARY_BRACKETS: Record<FilingStatus, Bracket[]> = {
  mfj: [
    { rate: 0.1, upTo: 24800 },
    { rate: 0.12, upTo: 100800 },
    { rate: 0.22, upTo: 211100 },
    { rate: 0.24, upTo: 403550 },
    { rate: 0.32, upTo: 512450 },
    { rate: 0.35, upTo: 768700 },
    { rate: 0.37, upTo: Infinity },
  ],
  single: [
    { rate: 0.1, upTo: 12400 },
    { rate: 0.12, upTo: 50400 },
    { rate: 0.22, upTo: 105550 },
    { rate: 0.24, upTo: 201775 },
    { rate: 0.32, upTo: 256225 },
    { rate: 0.35, upTo: 640600 },
    { rate: 0.37, upTo: Infinity },
  ],
};

export const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  mfj: 32200,
  single: 16100,
};

// Long-term capital gains / qualified dividends brackets (taxable income thresholds)
export const LTCG_BRACKETS: Record<FilingStatus, Bracket[]> = {
  mfj: [
    { rate: 0, upTo: 99050 },
    { rate: 0.15, upTo: 615350 },
    { rate: 0.2, upTo: Infinity },
  ],
  single: [
    { rate: 0, upTo: 49500 },
    { rate: 0.15, upTo: 553850 },
    { rate: 0.2, upTo: Infinity },
  ],
};

// Net investment income tax — MAGI thresholds are NOT inflation-indexed by law
export const NIIT_RATE = 0.038;
export const NIIT_THRESHOLD: Record<FilingStatus, number> = { mfj: 250000, single: 200000 };

// Social Security taxability (provisional income) — fixed nominal by law
export const SS_PROVISIONAL: Record<FilingStatus, { tier1: number; tier2: number }> = {
  mfj: { tier1: 32000, tier2: 44000 },
  single: { tier1: 25000, tier2: 34000 },
};

// IRMAA (2026): MAGI from 2 years prior → monthly surcharges per person.
// partB = surcharge above the base Part B premium; partD = Part D surcharge.
export interface IrmaaTier {
  magiUpTo: number;
  partBSurcharge: number; // $/mo
  partDSurcharge: number; // $/mo
}
export const IRMAA_TIERS: Record<FilingStatus, IrmaaTier[]> = {
  mfj: [
    { magiUpTo: 218000, partBSurcharge: 0, partDSurcharge: 0 },
    { magiUpTo: 274000, partBSurcharge: 81.2, partDSurcharge: 14.5 },
    { magiUpTo: 342000, partBSurcharge: 143.7, partDSurcharge: 37 },
    { magiUpTo: 410000, partBSurcharge: 224.9, partDSurcharge: 59.4 },
    { magiUpTo: 750000, partBSurcharge: 367.6, partDSurcharge: 91 },
    { magiUpTo: Infinity, partBSurcharge: 487, partDSurcharge: 91 },
  ],
  single: [
    { magiUpTo: 109000, partBSurcharge: 0, partDSurcharge: 0 },
    { magiUpTo: 137000, partBSurcharge: 81.2, partDSurcharge: 14.5 },
    { magiUpTo: 171000, partBSurcharge: 143.7, partDSurcharge: 37 },
    { magiUpTo: 205000, partBSurcharge: 224.9, partDSurcharge: 59.4 },
    { magiUpTo: 500000, partBSurcharge: 367.6, partDSurcharge: 91 },
    { magiUpTo: Infinity, partBSurcharge: 487, partDSurcharge: 91 },
  ],
};

// ACA marketplace subsidy: expected household contribution as % of MAGI, by
// MAGI as a multiple of the federal poverty level. Two rule sets:
// - 'cliff': pre-ARPA rules (no subsidy above 400% FPL) — the law reverting in
//   2026 after the enhanced credits expired
// - 'enhanced': ARPA/IRA-style (contribution capped at 8.5%, no cliff)
// Each entry: [fplMultiple, contributionPct] — linear interpolation between points.
export const ACA_CONTRIBUTION_CURVE: Record<'cliff' | 'enhanced', [number, number][]> = {
  cliff: [
    [1.33, 0.021],
    [1.5, 0.042],
    [2.0, 0.066],
    [2.5, 0.0844],
    [3.0, 0.0996],
    [4.0, 0.0996],
  ],
  enhanced: [
    [1.5, 0],
    [2.0, 0.02],
    [2.5, 0.04],
    [3.0, 0.06],
    [4.0, 0.085],
  ],
};
export const ACA_CLIFF_MULTIPLE = 4.0; // above this, no subsidy under 'cliff' rules
// Federal poverty level, household of 2 (2026, contiguous US) — today's $
export const FPL_HOUSEHOLD_2 = 21150;
export const FPL_HOUSEHOLD_1 = 15650;

// RMD: SECURE 2.0 start age — 73 for those born 1951–1959, 75 for 1960+
export function rmdStartAge(birthYear: number): number {
  return birthYear >= 1960 ? 75 : 73;
}

// IRS Uniform Lifetime Table (distribution period by age)
export const UNIFORM_LIFETIME: Record<number, number> = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
  80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2,
  87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
  94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4,
  101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1,
  108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0,
  115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
};

export function uniformLifetimeFactor(age: number): number {
  if (age < 73) return Infinity;
  return UNIFORM_LIFETIME[Math.min(age, 120)];
}
