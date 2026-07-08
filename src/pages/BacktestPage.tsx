import { useMemo, useState } from 'react';
import type { PlanInputs } from '../model/types';
import { runBacktest } from '../model/backtest';
import { HISTORY } from '../model/data/history';
import type { Theme } from '../theme';
import { moneyCompact, pct } from '../format';
import { StatTile, Field, PercentInput } from '../components/ui';
import { MonteCarloChart } from '../components/charts';

export function BacktestPage({ inputs, theme }: { inputs: PlanInputs; theme: Theme }) {
  const [stockPct, setStockPct] = useState(0.7);
  const bt = useMemo(() => runBacktest(inputs, stockPct), [inputs, stockPct]);

  return (
    <div className="dashboard">
      <div className="card">
        <h3>Historical backtest</h3>
        <p className="card-note">
          Runs your full plan through every complete historical window since {HISTORY[0].year} — the Depression, the
          1966–82 stagflation, the dot-com bust, 2008 — using real (inflation-adjusted) returns of a stock/bond mix,
          re-based to your plan's inflation assumption. This answers "would my plan have survived the worst sequences
          on record?" and complements Monte Carlo's randomized draws. The plan's down-market stress test is replaced
          by history here.
        </p>
        <div className="mc-controls">
          <Field label="Stock allocation" hint="Remainder in 10-year Treasuries; S&P 500 total returns">
            <PercentInput value={stockPct} onChange={(v) => setStockPct(Math.min(Math.max(v, 0), 1))} />
          </Field>
        </div>
      </div>

      {!bt ? (
        <div className="card">
          <p className="card-note">
            Your projection horizon is longer than the historical record ({HISTORY.length} years) — no complete
            windows to test.
          </p>
        </div>
      ) : (
        <>
          <div className="stat-row">
            <StatTile
              label="Historical success rate"
              value={pct(bt.successRate, 1)}
              detail={`${bt.windows.filter((w) => !w.runsOut).length} of ${bt.windows.length} starting years survived`}
              tone={bt.successRate >= 0.9 ? 'good' : bt.successRate < 0.75 ? 'bad' : undefined}
            />
            <StatTile label="Median final balance" value={moneyCompact(bt.medianFinalBalanceReal)} detail="today's dollars" />
            <StatTile
              label="Windows tested"
              value={String(bt.windows.length)}
              detail={`${HISTORY[0].year}–${HISTORY[bt.windows.length - 1].year} cohorts, ${bt.years.length}-year plans`}
            />
          </div>

          <div className="card">
            <h3>Range of outcomes across history</h3>
            <MonteCarloChart mc={bt} theme={theme} />
          </div>

          <div className="card">
            <h3>Toughest starting years</h3>
            <div className="table-scroll">
              <table className="year-table">
                <thead>
                  <tr>
                    <th>If markets replay…</th>
                    <th>Outcome</th>
                    <th>Years lasted</th>
                    <th>Final balance (today's $)</th>
                  </tr>
                </thead>
                <tbody>
                  {bt.worst.map((w) => (
                    <tr key={w.startYear} className={w.runsOut ? 'shortfall' : ''}>
                      <td>{w.startYear} cohort</td>
                      <td>{w.runsOut ? `⚠ Fails (plan year ${w.runOutPlanYear})` : '✓ Survives'}</td>
                      <td>
                        {w.yearsLasted}
                        {w.runsOut ? '' : ` of ${bt.years.length}`}
                      </td>
                      <td>{moneyCompact(w.finalBalanceReal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
