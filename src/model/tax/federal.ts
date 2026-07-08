import {
  ORDINARY_BRACKETS,
  LTCG_BRACKETS,
  STANDARD_DEDUCTION,
  NIIT_RATE,
  NIIT_THRESHOLD,
  SS_PROVISIONAL,
  IRMAA_TIERS,
  ACA_CONTRIBUTION_CURVE,
  ACA_CLIFF_MULTIPLE,
  type FilingStatus,
  type Bracket,
} from './constants';

// Bracket thresholds and the standard deduction are CPI-indexed: inflate from
// BASE_YEAR by `indexFactor`. NIIT and SS provisional thresholds are fixed by law.

function taxFromBrackets(taxable: number, brackets: Bracket[], indexFactor: number): number {
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    const ceil = b.upTo === Infinity ? Infinity : b.upTo * indexFactor;
    if (taxable <= prev) break;
    tax += (Math.min(taxable, ceil) - prev) * b.rate;
    prev = ceil;
  }
  return tax;
}

export function ordinaryTax(taxableOrdinary: number, status: FilingStatus, indexFactor: number): number {
  return taxFromBrackets(Math.max(taxableOrdinary, 0), ORDINARY_BRACKETS[status], indexFactor);
}

// LTCG/qualified dividends stack on top of ordinary taxable income
export function ltcgTax(
  taxableOrdinary: number,
  ltcgAmount: number,
  status: FilingStatus,
  indexFactor: number,
): number {
  const ord = Math.max(taxableOrdinary, 0);
  const gains = Math.max(ltcgAmount, 0);
  if (gains === 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const b of LTCG_BRACKETS[status]) {
    const ceil = b.upTo === Infinity ? Infinity : b.upTo * indexFactor;
    const from = Math.max(prev, ord);
    const to = Math.min(ceil, ord + gains);
    if (to > from) tax += (to - from) * b.rate;
    prev = ceil;
    if (ceil >= ord + gains) break;
  }
  return tax;
}

// Taxable portion of Social Security benefits (provisional income formula).
// otherIncome = AGI components other than SS (ordinary + dividends + gains) +
// tax-exempt interest. Thresholds are fixed nominal by law.
export function taxableSocialSecurity(ssBenefit: number, otherIncome: number, status: FilingStatus): number {
  if (ssBenefit <= 0) return 0;
  const { tier1, tier2 } = SS_PROVISIONAL[status];
  const provisional = otherIncome + ssBenefit / 2;
  if (provisional <= tier1) return 0;
  if (provisional <= tier2) return Math.min(0.5 * (provisional - tier1), 0.5 * ssBenefit);
  const tier1Part = Math.min(0.5 * (tier2 - tier1), 0.5 * ssBenefit);
  return Math.min(0.85 * (provisional - tier2) + tier1Part, 0.85 * ssBenefit);
}

export function niit(netInvestmentIncome: number, magi: number, status: FilingStatus): number {
  if (netInvestmentIncome <= 0) return 0;
  const over = magi - NIIT_THRESHOLD[status];
  if (over <= 0) return 0;
  return NIIT_RATE * Math.min(netInvestmentIncome, over);
}

export interface HouseholdTaxInput {
  ordinaryIncome: number; // traditional withdrawals + Roth conversions (pre-deduction)
  investmentIncome: number; // realized LTCG + qualified dividends
  ssBenefit: number;
  status: FilingStatus;
  indexFactor: number; // cumulative inflation since BASE_YEAR
  stateRate: number; // flat state rate on AGI net of deduction
}

export interface HouseholdTaxResult {
  federal: number;
  state: number;
  total: number;
  agi: number;
  magi: number; // = AGI here (no tax-exempt interest modeled)
  taxableSS: number;
}

export function householdTax(input: HouseholdTaxInput): HouseholdTaxResult {
  const { ordinaryIncome, investmentIncome, ssBenefit, status, indexFactor, stateRate } = input;
  const taxableSS = taxableSocialSecurity(ssBenefit, ordinaryIncome + investmentIncome, status);
  const agi = ordinaryIncome + investmentIncome + taxableSS;
  const deduction = STANDARD_DEDUCTION[status] * indexFactor;
  // Deduction offsets ordinary income first; any excess offsets investment income
  const taxableOrdinary = Math.max(ordinaryIncome + taxableSS - deduction, 0);
  const excessDeduction = Math.max(deduction - (ordinaryIncome + taxableSS), 0);
  const taxableGains = Math.max(investmentIncome - excessDeduction, 0);
  const federal =
    ordinaryTax(taxableOrdinary, status, indexFactor) +
    ltcgTax(taxableOrdinary, taxableGains, status, indexFactor) +
    niit(investmentIncome, agi, status);
  const state = stateRate * Math.max(agi - deduction, 0);
  return { federal, state, total: federal + state, agi, magi: agi, taxableSS };
}

// ACA: annual premium subsidy for the household. benchmarkPremium and magi are
// nominal for the year; fpl must be inflated to the same year.
export function acaSubsidy(
  magi: number,
  benchmarkPremium: number,
  fpl: number,
  rules: 'cliff' | 'enhanced',
): number {
  if (benchmarkPremium <= 0 || fpl <= 0) return 0;
  const multiple = magi / fpl;
  if (rules === 'cliff' && multiple > ACA_CLIFF_MULTIPLE) return 0;
  const curve = ACA_CONTRIBUTION_CURVE[rules];
  let contributionPct: number;
  if (multiple <= curve[0][0]) contributionPct = curve[0][1];
  else if (multiple >= curve[curve.length - 1][0]) contributionPct = curve[curve.length - 1][1];
  else {
    contributionPct = curve[curve.length - 1][1];
    for (let i = 1; i < curve.length; i++) {
      if (multiple <= curve[i][0]) {
        const [x0, y0] = curve[i - 1];
        const [x1, y1] = curve[i];
        contributionPct = y0 + ((multiple - x0) / (x1 - x0)) * (y1 - y0);
        break;
      }
    }
  }
  const expectedContribution = contributionPct * magi;
  return Math.max(benchmarkPremium - expectedContribution, 0);
}

// IRMAA: annual per-person surcharge (Part B + Part D) from lookback MAGI.
// Thresholds are CPI-indexed → scale by indexFactor; surcharge $ amounts grow
// with Medicare costs, which the caller applies.
export function irmaaAnnualSurcharge(lookbackMagi: number, status: FilingStatus, indexFactor: number): {
  tier: number;
  annualSurcharge: number;
} {
  const tiers = IRMAA_TIERS[status];
  for (let i = 0; i < tiers.length; i++) {
    const ceil = tiers[i].magiUpTo === Infinity ? Infinity : tiers[i].magiUpTo * indexFactor;
    if (lookbackMagi <= ceil) {
      return { tier: i, annualSurcharge: (tiers[i].partBSurcharge + tiers[i].partDSurcharge) * 12 };
    }
  }
  const top = tiers[tiers.length - 1];
  return { tier: tiers.length - 1, annualSurcharge: (top.partBSurcharge + top.partDSurcharge) * 12 };
}
