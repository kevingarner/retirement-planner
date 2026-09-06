import type { PlanInputs, ProjectionResult } from './types';
import { runPlan } from './detailed';
import { runMonteCarlo, type MonteCarloParams, type MonteCarloGuardrailStats } from './montecarlo';

export interface WithdrawalStrategyResult {
  label: string;
  result: ProjectionResult;
  lifetimeRealSpending: number;
  minRealSpending: number;
  maxRealSpending: number;
  mcSuccess: number;
  mcGuardrails: MonteCarloGuardrailStats | undefined;
}

function spendingStats(inputs: PlanInputs) {
  const r = runPlan(inputs);
  const retRows = r.rows.filter((x) => x.phase === 'Retirement');
  const realSpend = retRows.map((x) => x.spending / Math.pow(1 + inputs.inflation, x.year - inputs.startYear));
  return {
    result: r,
    lifetimeRealSpending: realSpend.reduce((s, v) => s + v, 0),
    minRealSpending: realSpend.length ? Math.min(...realSpend) : 0,
    maxRealSpending: realSpend.length ? Math.max(...realSpend) : 0,
  };
}

// Shared by the Strategies page and the printable Report so both show
// identical numbers instead of two independent computations drifting apart.
export function compareWithdrawalStrategies(inputs: PlanInputs, mcParams: MonteCarloParams): WithdrawalStrategyResult[] {
  const fixed = spendingStats({ ...inputs, withdrawalStrategy: 'fixed' });
  const guardrails = spendingStats({ ...inputs, withdrawalStrategy: 'guardrails' });
  const fixedMc = runMonteCarlo({ ...inputs, withdrawalStrategy: 'fixed' }, mcParams);
  const guardrailsMc = runMonteCarlo({ ...inputs, withdrawalStrategy: 'guardrails' }, mcParams);
  return [
    { label: 'Fixed (inflation-adjusted)', ...fixed, mcSuccess: fixedMc.successRate, mcGuardrails: fixedMc.guardrailStats },
    {
      label: `Guardrails (±${Math.round(inputs.guardrails.band * 100)}% band, ${Math.round(inputs.guardrails.adjustment * 100)}% steps)`,
      ...guardrails,
      mcSuccess: guardrailsMc.successRate,
      mcGuardrails: guardrailsMc.guardrailStats,
    },
  ];
}
