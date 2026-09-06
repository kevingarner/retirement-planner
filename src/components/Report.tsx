import { useMemo } from 'react';
import type { PlanInputs } from '../model/types';
import { runPlan } from '../model/detailed';
import { runMonteCarlo, type MonteCarloParams } from '../model/montecarlo';
import { runBacktest } from '../model/backtest';
import { compareWithdrawalStrategies } from '../model/withdrawalStrategies';
import { compareRothStrategies } from '../model/rothStrategies';
import type { Theme } from '../theme';
import { money, moneyCompact, pct } from '../format';
import { StatTile } from './ui';
import { BalanceChart, CashflowChart } from './charts';
import { YearTable } from './YearTable';

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-summary-item">
      <span className="report-summary-label">{label}</span>
      <span className="report-summary-value">{value}</span>
    </div>
  );
}

export function ReportOverlay({
  inputs,
  theme,
  mcParams,
  onClose,
}: {
  inputs: PlanInputs;
  theme: Theme;
  mcParams: MonteCarloParams;
  onClose: () => void;
}) {
  const result = useMemo(() => runPlan(inputs), [inputs]);
  const mc = useMemo(() => runMonteCarlo(inputs, mcParams), [inputs, mcParams]);
  const bt = useMemo(() => runBacktest(inputs, 0.7), [inputs]);
  const withdrawal = useMemo(() => compareWithdrawalStrategies(inputs, mcParams), [inputs, mcParams]);
  const roth = useMemo(() => compareRothStrategies(inputs), [inputs]);
  const bestRoth = roth
    ? (roth.filter((r) => !r.runsOut).length ? roth.filter((r) => !r.runsOut) : roth).reduce((a, b) =>
        b.afterTaxEstateReal > a.afterTaxEstateReal ? b : a,
      )
    : null;
  const last = result.rows[result.rows.length - 1];

  return (
    <div className="report-overlay">
      <div className="report-actions no-print">
        <button className="btn" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <button className="btn subtle" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="report-page">
        <h1>Retirement Plan Report</h1>
        <p className="report-date">
          Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} ·{' '}
          {inputs.taxMode === 'detailed' ? 'detailed tax mode' : 'simple tax mode'} ·{' '}
          {inputs.withdrawalStrategy === 'guardrails' ? 'guardrails withdrawals' : 'fixed withdrawals'}
        </p>

        <div className={`verdict ${result.runsOut ? 'bad' : 'good'}`}>
          {result.runsOut ? `⚠ Money runs out in ${result.runOutYear}` : `✓ Plan survives to ${result.endYear}`}
        </div>

        <section className="report-section">
          <h2>Key assumptions</h2>
          <div className="report-summary">
            <SummaryItem
              label={inputs.single ? 'Age today' : 'Ages today'}
              value={inputs.single ? `${inputs.you.currentAge}` : `${inputs.you.currentAge} / ${inputs.spouse.currentAge}`}
            />
            <SummaryItem
              label={inputs.single ? 'Retirement age' : 'Retirement ages'}
              value={inputs.single ? `${inputs.you.retirementAge}` : `${inputs.you.retirementAge} / ${inputs.spouse.retirementAge}`}
            />
            <SummaryItem label="Plan horizon" value={`to age ${inputs.you.lifeExpectancy} (${result.endYear})`} />
            <SummaryItem label="Current portfolio" value={moneyCompact(inputs.currentBalance)} />
            <SummaryItem
              label="Returns (accum / retire)"
              value={`${pct(inputs.returnAccumulation, 1)} / ${pct(inputs.returnRetirement, 1)}`}
            />
            <SummaryItem label="Inflation" value={pct(inputs.inflation, 1)} />
            <SummaryItem
              label="Go-Go spending"
              value={`${moneyCompact(inputs.goGoSpending)}/yr to age ${inputs.goGoEndAge}`}
            />
            <SummaryItem
              label="Social Security"
              value={
                inputs.includeSS
                  ? `on, at ${inputs.single ? inputs.you.ssStartAge : `${inputs.you.ssStartAge}/${inputs.spouse.ssStartAge}`}${inputs.ssCutPct > 0 ? `, ${pct(inputs.ssCutPct, 0)} cut from ${inputs.ssCutStartYear}` : ''}`
                  : 'excluded'
              }
            />
          </div>
        </section>

        <section className="report-section">
          <h2>Outcomes</h2>
          <div className="stat-row">
            <StatTile
              label="Balance at retirement"
              value={result.balanceAtRetirement !== null ? moneyCompact(result.balanceAtRetirement) : '—'}
              detail={`${result.retirementYearYou}`}
            />
            <StatTile
              label="Final balance"
              value={moneyCompact(result.finalBalance)}
              detail={`${result.endYear} · ${moneyCompact(last.endBalanceReal)} today's $`}
              tone={result.runsOut ? 'bad' : 'good'}
            />
            <StatTile
              label="Monte Carlo success"
              value={pct(mc.successRate, 1)}
              detail={`${mcParams.simulations.toLocaleString()} randomized-return simulations`}
              tone={mc.successRate >= 0.9 ? 'good' : mc.successRate < 0.75 ? 'bad' : undefined}
            />
            <StatTile
              label="Historical success"
              value={bt ? pct(bt.successRate, 1) : '—'}
              detail={bt ? `${bt.windows.length} cohorts since 1928, 70% stocks` : 'horizon exceeds record'}
              tone={bt ? (bt.successRate >= 0.9 ? 'good' : bt.successRate < 0.75 ? 'bad' : undefined) : undefined}
            />
          </div>
          {inputs.taxMode === 'detailed' && (
            <div className="stat-row">
              <StatTile label="Lifetime taxes" value={moneyCompact(result.lifetimeTax ?? 0)} detail="federal + state, nominal" />
              <StatTile label="ACA subsidies" value={moneyCompact(result.lifetimeAcaSubsidy ?? 0)} detail="lifetime, nominal" />
              <StatTile
                label="After-tax estate"
                value={moneyCompact(result.afterTaxEstate ?? 0)}
                detail={`nominal at ${result.endYear}`}
              />
            </div>
          )}
        </section>

        <section className="report-section">
          <h2>Portfolio balance</h2>
          <BalanceChart result={result} theme={theme} />
        </section>

        <section className="report-section">
          <h2>Retirement cash flow</h2>
          <CashflowChart result={result} theme={theme} />
        </section>

        <section className="report-section">
          <h2>Withdrawal strategy: fixed vs. guardrails</h2>
          <div className="table-scroll">
            <table className="year-table">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Outcome</th>
                  <th>Monte Carlo success</th>
                  <th>Lifetime spending (today's $)</th>
                  <th>Lowest year (today's $)</th>
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
                    <td>{pct(w.mcSuccess, 1)}</td>
                    <td>{moneyCompact(w.lifetimeRealSpending)}</td>
                    <td>{money(w.minRealSpending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {roth && bestRoth && (
          <section className="report-section">
            <h2>Roth conversion strategies</h2>
            <p className="card-note">
              Best for this plan: {bestRoth.label} — {moneyCompact(bestRoth.afterTaxEstateReal)} after-tax estate
              (today's $)
            </p>
            <div className="table-scroll">
              <table className="year-table">
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th>Total converted</th>
                    <th>Lifetime taxes</th>
                    <th>After-tax estate (today's $)</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {roth.map((r) => (
                    <tr key={r.label}>
                      <td>
                        {r.label}
                        {r.label === bestRoth.label && ' ⭐'}
                      </td>
                      <td>{moneyCompact(r.totalConverted)}</td>
                      <td>{moneyCompact(r.lifetimeTax)}</td>
                      <td>{moneyCompact(r.afterTaxEstateReal)}</td>
                      <td>{r.runsOut ? `⚠ Runs out ${r.runOutYear}` : '✓ Survives'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="report-section">
          <h2>Year by year</h2>
          <YearTable result={result} />
        </section>

        <p className="report-disclaimer">
          This is a planning estimate based on the inputs and assumptions on this page — it is not financial, tax,
          or legal advice. Verify significant decisions with a qualified professional before acting on them.
        </p>
      </div>
    </div>
  );
}
