import type { PlanInputs } from './types';
import { runPlan } from './detailed';
import { runMonteCarlo, type MonteCarloParams } from './montecarlo';

function survives(inputs: PlanInputs): boolean {
  return !runPlan(inputs).runsOut;
}

// A full binary search at the Monte Carlo tab's own simulation count (which
// can go up to 5000) would take many seconds in detailed tax mode — this
// fixed, smaller count keeps the solver responsive. It reuses the tab's
// volatility/seed so the risk assumptions still match, just not the sample
// size; the UI discloses this rather than pretending it's the same number.
const SOLVER_SIMULATIONS = 200;
const SOLVER_ITERATIONS = 20;

function mcSuccessAt(inputs: PlanInputs, mcParams: MonteCarloParams, goGoSpending: number): number {
  const params: MonteCarloParams = { ...mcParams, simulations: SOLVER_SIMULATIONS };
  return runMonteCarlo({ ...inputs, goGoSpending }, params).successRate;
}

// Largest Go-Go spending (today's $) for which Monte Carlo success rate stays
// at or above `targetSuccess`. Same idea as maxSustainableSpending but against
// randomized returns instead of one fixed-return path. Returns null if it
// fails even at zero spending.
export function maxSustainableSpendingMonteCarlo(
  inputs: PlanInputs,
  mcParams: MonteCarloParams,
  targetSuccess: number,
): number | null {
  if (mcSuccessAt(inputs, mcParams, 0) < targetSuccess) return null;
  let lo = 0;
  let hi = Math.max(inputs.goGoSpending * 2, 100000);
  while (mcSuccessAt(inputs, mcParams, hi) >= targetSuccess) {
    hi *= 2;
    if (hi > 1e9) return hi;
  }
  for (let i = 0; i < SOLVER_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (mcSuccessAt(inputs, mcParams, mid) >= targetSuccess) lo = mid;
    else hi = mid;
  }
  return lo;
}

// Largest Go-Go spending (today's $) for which the portfolio never runs out.
// Returns null if it fails even at zero spending.
export function maxSustainableSpending(inputs: PlanInputs): number | null {
  if (!survives({ ...inputs, goGoSpending: 0 })) return null;
  let lo = 0;
  let hi = Math.max(inputs.goGoSpending * 2, 100000);
  while (survives({ ...inputs, goGoSpending: hi })) {
    hi *= 2;
    if (hi > 1e9) return hi;
  }
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (survives({ ...inputs, goGoSpending: mid })) lo = mid;
    else hi = mid;
  }
  return lo;
}

// Earliest retirement age for "you", shifting the spouse's retirement by the
// same number of years (preserving the current gap). Returns null if even
// retiring at life expectancy fails.
export function earliestRetirementAge(inputs: PlanInputs): number | null {
  const gap = inputs.spouse.retirementAge - inputs.spouse.currentAge - (inputs.you.retirementAge - inputs.you.currentAge);
  const minAge = inputs.you.currentAge + 1;
  const maxAge = inputs.you.lifeExpectancy;
  for (let age = minAge; age <= maxAge; age++) {
    const yearsUntil = age - inputs.you.currentAge;
    const candidate: PlanInputs = {
      ...inputs,
      you: { ...inputs.you, retirementAge: age },
      spouse: { ...inputs.spouse, retirementAge: inputs.spouse.currentAge + yearsUntil + gap },
    };
    if (survives(candidate)) return age;
  }
  return null;
}

// Smallest retirement-phase return for which the portfolio never runs out.
// Returns null if it fails even at a 15% return.
export function requiredRetirementReturn(inputs: PlanInputs): number | null {
  if (survives({ ...inputs, returnRetirement: -0.05 })) return -0.05;
  if (!survives({ ...inputs, returnRetirement: 0.15 })) return null;
  let lo = -0.05;
  let hi = 0.15;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (survives({ ...inputs, returnRetirement: mid })) hi = mid;
    else lo = mid;
  }
  return hi;
}

export interface SensitivityRow {
  label: string;
  finalBalance: number;
  finalBalanceReal: number;
  runOutYear: number | null;
}

// One-way sensitivity: perturb key drivers one at a time
export function oneWaySensitivity(inputs: PlanInputs): SensitivityRow[] {
  const cases: { label: string; mod: (i: PlanInputs) => PlanInputs }[] = [
    { label: 'Base case', mod: (i) => i },
    { label: 'Returns −1%', mod: (i) => ({ ...i, returnAccumulation: i.returnAccumulation - 0.01, returnRetirement: i.returnRetirement - 0.01 }) },
    { label: 'Returns +1%', mod: (i) => ({ ...i, returnAccumulation: i.returnAccumulation + 0.01, returnRetirement: i.returnRetirement + 0.01 }) },
    { label: 'Inflation +1%', mod: (i) => ({ ...i, inflation: i.inflation + 0.01 }) },
    { label: 'Spending +10%', mod: (i) => ({ ...i, goGoSpending: i.goGoSpending * 1.1 }) },
    { label: 'Spending −10%', mod: (i) => ({ ...i, goGoSpending: i.goGoSpending * 0.9 }) },
    { label: 'Retire 2 years later', mod: (i) => ({
        ...i,
        you: { ...i.you, retirementAge: i.you.retirementAge + 2 },
        spouse: { ...i.spouse, retirementAge: i.spouse.retirementAge + 2 },
      }) },
    { label: 'Live 5 years longer', mod: (i) => ({
        ...i,
        you: { ...i.you, lifeExpectancy: i.you.lifeExpectancy + 5 },
        spouse: { ...i.spouse, lifeExpectancy: i.spouse.lifeExpectancy + 5 },
      }) },
  ];
  return cases.map(({ label, mod }) => {
    const r = runPlan(mod(inputs));
    const last = r.rows[r.rows.length - 1];
    return { label, finalBalance: r.finalBalance, finalBalanceReal: last.endBalanceReal, runOutYear: r.runOutYear };
  });
}
