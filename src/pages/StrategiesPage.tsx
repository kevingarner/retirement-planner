import { useMemo } from 'react';
import type { PlanInputs } from '../model/types';
import { runPlan } from '../model/detailed';
import { runMonteCarlo, defaultMonteCarloParams } from '../model/montecarlo';
import { compareClaimingStrategies } from '../model/claiming';
import { money, moneyCompact, pct } from '../format';

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

export function StrategiesPage({ inputs }: { inputs: PlanInputs }) {
  const withdrawal = useMemo(() => {
    const fixed = spendingStats({ ...inputs, withdrawalStrategy: 'fixed' });
    const guardrails = spendingStats({ ...inputs, withdrawalStrategy: 'guardrails' });
    const mcParams = { ...defaultMonteCarloParams, simulations: 500 };
    const fixedMc = runMonteCarlo({ ...inputs, withdrawalStrategy: 'fixed' }, mcParams);
    const guardrailsMc = runMonteCarlo({ ...inputs, withdrawalStrategy: 'guardrails' }, mcParams);
    return [
      { label: 'Fixed (inflation-adjusted)', ...fixed, mcSuccess: fixedMc.successRate },
      { label: `Guardrails (±${Math.round(inputs.guardrails.band * 100)}% band, ${Math.round(inputs.guardrails.adjustment * 100)}% steps)`, ...guardrails, mcSuccess: guardrailsMc.successRate },
    ];
  }, [inputs]);

  const claiming = useMemo(() => compareClaimingStrategies(inputs), [inputs]);
  const bestClaim = claiming.reduce((a, b) => (b.finalBalance > a.finalBalance ? b : a));

  return (
    <div className="dashboard">
      <div className="card">
        <h3>Withdrawal strategy: fixed vs. guardrails</h3>
        <p className="card-note">
          Fixed spends the plan amount every year regardless of markets. Guardrails cuts spending{' '}
          {Math.round(inputs.guardrails.adjustment * 100)}% when the withdrawal rate drifts{' '}
          {Math.round(inputs.guardrails.band * 100)}% above its starting level, and raises it after strong markets —
          trading spending stability for survival odds. Monte Carlo success uses 500 simulations.
        </p>
        <div className="table-scroll">
          <table className="year-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Outcome</th>
                <th>Final balance</th>
                <th>Monte Carlo success</th>
                <th>Lifetime spending (today's $)</th>
                <th>Lowest year (today's $)</th>
                <th>Highest year (today's $)</th>
              </tr>
            </thead>
            <tbody>
              {withdrawal.map((w) => (
                <tr key={w.label}>
                  <td>
                    {w.label}
                    {inputs.withdrawalStrategy === (w.label.startsWith('Fixed') ? 'fixed' : 'guardrails') && ' (current)'}
                  </td>
                  <td>{w.result.runsOut ? `⚠ Runs out ${w.result.runOutYear}` : '✓ Survives'}</td>
                  <td>{moneyCompact(w.result.finalBalance)}</td>
                  <td>{pct(w.mcSuccess, 1)}</td>
                  <td>{moneyCompact(w.lifetimeRealSpending)}</td>
                  <td>{money(w.minRealSpending)}</td>
                  <td>{money(w.maxRealSpending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="card-note" style={{ marginTop: 10 }}>
          Read "lowest year" as the belt-tightening you'd have to accept in a bad stretch. Switch strategies in the
          inputs panel under Retirement spending phases.
        </p>
      </div>

      <div className="card">
        <h3>Social Security claiming ages</h3>
        <p className="card-note">
          Benefits are converted through your PIA using the standard actuarial factors (70% at 62, 124% at 70,
          FRA 67). Social Security is switched on for every row so strategies are comparable
          {!inputs.includeSS && ' — note your plan currently excludes SS'}. Your benefit-cut assumption
          {inputs.ssCutPct > 0 ? ` (${Math.round(inputs.ssCutPct * 100)}% from ${inputs.ssCutStartYear})` : ''} and
          the survivor scenario, if enabled, apply to every row too.
        </p>
        <div className="table-scroll">
          <table className="year-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>{inputs.single ? 'Claim age' : `Claim ages (${inputs.you.name}/${inputs.spouse.name})`}</th>
                <th>Lifetime SS received</th>
                <th>Final balance</th>
                {claiming.some((c) => c.lifetimeTax !== undefined) && <th>Lifetime taxes</th>}
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {claiming.map((c) => (
                <tr key={c.label} className={c.runsOut ? 'shortfall' : ''}>
                  <td>
                    {c.label}
                    {c.label === bestClaim.label && ' ⭐'}
                  </td>
                  <td>{inputs.single ? c.youAge : `${c.youAge}/${c.spouseAge}`}</td>
                  <td>{moneyCompact(c.lifetimeSS)}</td>
                  <td>{moneyCompact(c.finalBalance)}</td>
                  {claiming.some((x) => x.lifetimeTax !== undefined) && (
                    <td>{c.lifetimeTax !== undefined ? moneyCompact(c.lifetimeTax) : '—'}</td>
                  )}
                  <td>{c.runsOut ? `⚠ Runs out ${c.runOutYear}` : '✓ Survives'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="card-note" style={{ marginTop: 10 }}>
          ⭐ = highest final balance. Delaying the higher earner's benefit also raises the survivor benefit — if you
          model a first death (Survivor scenario), that effect is already in these numbers. Lifetime SS alone favors
          claiming early when projections end sooner; the portfolio effect usually favors delay for long retirements.
        </p>
      </div>
    </div>
  );
}
