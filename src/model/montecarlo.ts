import type { PlanInputs } from './types';
import { projectionEndYear } from './projection';
import { runPlan } from './detailed';

export interface MonteCarloParams {
  simulations: number;
  volatilityAccumulation: number; // stdev of annual returns pre-retirement
  volatilityRetirement: number; // stdev of annual returns in retirement
  seed: number;
}

export const defaultMonteCarloParams: MonteCarloParams = {
  simulations: 1000,
  volatilityAccumulation: 0.15,
  volatilityRetirement: 0.1,
  seed: 42,
};

export interface MonteCarloResult {
  successRate: number; // fraction of sims where the portfolio never hits 0
  years: number[];
  percentiles: { p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[] };
  medianFinalBalance: number;
  runOutYears: (number | null)[];
}

// Deterministic PRNG so results are reproducible run-to-run
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianPair(rand: () => number): [number, number] {
  // Box-Muller
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

function percentile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function runMonteCarlo(inputs: PlanInputs, params: MonteCarloParams): MonteCarloResult {
  const rand = mulberry32(params.seed);
  const endYear = projectionEndYear(inputs);
  const numYears = endYear - inputs.startYear + 1;

  // Phase by year is deterministic (depends only on ages)
  const isAccumulation: boolean[] = [];
  for (let t = 0; t < numYears; t++) {
    isAccumulation.push(
      inputs.you.currentAge + t < inputs.you.retirementAge &&
        inputs.spouse.currentAge + t < inputs.spouse.retirementAge,
    );
  }

  const balancesByYear: number[][] = Array.from({ length: numYears }, () => []);
  const runOutYears: (number | null)[] = [];
  let successes = 0;
  const finals: number[] = [];

  const gaussians: number[] = [];
  const nextGaussian = () => {
    if (gaussians.length === 0) gaussians.push(...gaussianPair(rand));
    return gaussians.pop()!;
  };

  for (let s = 0; s < params.simulations; s++) {
    const overrides: number[] = [];
    for (let t = 0; t < numYears; t++) {
      const mu = isAccumulation[t] ? inputs.returnAccumulation : inputs.returnRetirement;
      const sigma = isAccumulation[t] ? params.volatilityAccumulation : params.volatilityRetirement;
      overrides.push(Math.max(mu + sigma * nextGaussian(), -0.9));
    }
    const result = runPlan(inputs, overrides);
    if (!result.runsOut) successes++;
    runOutYears.push(result.runOutYear);
    finals.push(result.finalBalance);
    for (let t = 0; t < numYears; t++) balancesByYear[t].push(result.rows[t].endBalance);
  }

  const years = Array.from({ length: numYears }, (_, t) => inputs.startYear + t);
  const pct = (p: number) =>
    balancesByYear.map((arr) => percentile([...arr].sort((a, b) => a - b), p));

  finals.sort((a, b) => a - b);
  return {
    successRate: successes / params.simulations,
    years,
    percentiles: { p10: pct(0.1), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p90: pct(0.9) },
    medianFinalBalance: percentile(finals, 0.5),
    runOutYears,
  };
}
