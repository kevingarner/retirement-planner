import type { PlanInputs } from './types';
import { projectionEndYear } from './projection';
import { runPlan } from './detailed';
import { HISTORY } from './data/history';

// Historical backtest: run the plan through every complete historical window.
// Each historical year contributes its REAL (inflation-adjusted) blended return,
// re-nominalized with the plan's own constant inflation rate — this preserves
// the historical sequence-of-real-returns risk while keeping the plan's nominal
// machinery (brackets, spending inflation) consistent.
// Note: return overrides replace the plan's stress-test returns.

export interface BacktestWindow {
  startYear: number; // historical cohort year
  runsOut: boolean;
  runOutPlanYear: number | null; // plan calendar year it failed
  yearsLasted: number;
  finalBalanceReal: number;
}

export interface BacktestResult {
  windows: BacktestWindow[];
  successRate: number;
  years: number[]; // plan calendar years
  percentiles: { p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[] };
  medianFinalBalanceReal: number;
  worst: BacktestWindow[];
}

function percentile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function runBacktest(inputs: PlanInputs, stockPct: number): BacktestResult | null {
  const numYears = projectionEndYear(inputs) - inputs.startYear + 1;
  if (numYears > HISTORY.length) return null;

  const realBlend = HISTORY.map((h) => {
    const nominal = stockPct * h.stocks + (1 - stockPct) * h.bonds;
    return (1 + nominal) / (1 + h.cpi) - 1;
  });

  const windows: BacktestWindow[] = [];
  const balancesByYear: number[][] = Array.from({ length: numYears }, () => []);
  const finals: number[] = [];

  for (let start = 0; start + numYears <= HISTORY.length; start++) {
    const overrides: number[] = [];
    for (let t = 0; t < numYears; t++) {
      overrides.push(realBlend[start + t] + inputs.inflation);
    }
    const r = runPlan(inputs, overrides);
    const lastReal = r.rows[r.rows.length - 1].endBalanceReal;
    const failIdx = r.rows.findIndex((row) => row.endBalance === 0);
    windows.push({
      startYear: HISTORY[start].year,
      runsOut: r.runsOut,
      runOutPlanYear: r.runOutYear,
      yearsLasted: failIdx === -1 ? numYears : failIdx,
      finalBalanceReal: lastReal,
    });
    finals.push(lastReal);
    for (let t = 0; t < numYears; t++) balancesByYear[t].push(r.rows[t].endBalance);
  }

  if (windows.length === 0) return null;

  const years = Array.from({ length: numYears }, (_, t) => inputs.startYear + t);
  const pct = (p: number) => balancesByYear.map((arr) => percentile([...arr].sort((a, b) => a - b), p));
  const worst = [...windows].sort((a, b) => a.yearsLasted - b.yearsLasted || a.finalBalanceReal - b.finalBalanceReal).slice(0, 5);

  return {
    windows,
    successRate: windows.filter((w) => !w.runsOut).length / windows.length,
    years,
    percentiles: { p10: pct(0.1), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p90: pct(0.9) },
    medianFinalBalanceReal: percentile([...finals].sort((a, b) => a - b), 0.5),
    worst,
  };
}
