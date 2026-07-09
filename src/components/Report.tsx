import { useMemo } from 'react';
import type { PlanInputs } from '../model/types';
import { runPlan } from '../model/detailed';
import { runMonteCarlo, defaultMonteCarloParams } from '../model/montecarlo';
import { runBacktest } from '../model/backtest';
import type { Theme } from '../theme';
import { moneyCompact, pct } from '../format';
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

export function ReportOverlay({ inputs, theme, onClose }: { inputs: PlanInputs; theme: Theme; onClose: () => void }) {
  const result = useMemo(() => runPlan(inputs), [inputs]);
  const mc = useMemo(() => runMonteCarlo(inputs, defaultMonteCarloParams), [inputs]);
  const bt = useMemo(() => runBacktest(inputs, 0.7), [inputs]);
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
              detail="1,000 randomized-return simulations"
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
