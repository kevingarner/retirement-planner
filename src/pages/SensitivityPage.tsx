import { useMemo, useState } from 'react';
import type { PlanInputs } from '../model/types';
import type { MonteCarloParams } from '../model/montecarlo';
import {
  maxSustainableSpending,
  earliestRetirementAge,
  requiredRetirementReturn,
  oneWaySensitivity,
  maxSustainableSpendingMonteCarlo,
} from '../model/sensitivity';
import { money, moneyCompact, pct } from '../format';
import { StatTile, Field, PercentInput } from '../components/ui';

export function SensitivityPage({ inputs, mcParams }: { inputs: PlanInputs; mcParams: MonteCarloParams }) {
  const [targetSuccess, setTargetSuccess] = useState(0.9);
  const maxSpend = useMemo(() => maxSustainableSpending(inputs), [inputs]);
  const earliestAge = useMemo(() => earliestRetirementAge(inputs), [inputs]);
  const requiredReturn = useMemo(() => requiredRetirementReturn(inputs), [inputs]);
  const table = useMemo(() => oneWaySensitivity(inputs), [inputs]);
  const maxSpendMc = useMemo(
    () => maxSustainableSpendingMonteCarlo(inputs, mcParams, targetSuccess),
    [inputs, mcParams, targetSuccess],
  );

  return (
    <div className="dashboard">
      <div className="card">
        <h3>Breakeven answers</h3>
        <p className="card-note">
          Each solver holds everything else in your plan constant (including any stress test, LTC, and survivor
          toggles) and finds the tipping point for one lever.
        </p>
        <div className="stat-row">
          <StatTile
            label="Max sustainable Go-Go spending"
            value={maxSpend !== null ? money(Math.floor(maxSpend / 1000) * 1000) : 'None'}
            detail={`vs ${money(inputs.goGoSpending)} planned (today's $)`}
            tone={maxSpend !== null && maxSpend >= inputs.goGoSpending ? 'good' : 'bad'}
            hint="Solved against your plan's single fixed-return projection — not Monte Carlo or Backtest — the most Go-Go spending that still survives to life expectancy at your assumed returns"
          />
          <StatTile
            label={`Earliest retirement age (${inputs.you.name})`}
            value={earliestAge !== null ? String(earliestAge) : 'Never'}
            detail={`vs ${inputs.you.retirementAge} planned · spouse shifts by the same years`}
            tone={earliestAge !== null && earliestAge <= inputs.you.retirementAge ? 'good' : 'bad'}
            hint="Same deterministic solver as the others here — not Monte Carlo or Backtest"
          />
          <StatTile
            label="Required return in retirement"
            value={requiredReturn !== null ? pct(requiredReturn, 2) : '> 15%'}
            detail={`vs ${pct(inputs.returnRetirement, 1)} assumed`}
            tone={requiredReturn !== null && requiredReturn <= inputs.returnRetirement ? 'good' : 'bad'}
            hint="The minimum retirement-phase return your plan needs, at today's spending and balances, to survive to life expectancy — solved deterministically, not from Monte Carlo or Backtest"
          />
        </div>
      </div>

      <div className="card">
        <h3>Monte Carlo breakeven</h3>
        <p className="card-note">
          Unlike the deterministic solvers above, this one uses randomized returns — same volatility and seed as your
          Monte Carlo tab settings, but a quick 200-simulation search instead of the full simulation count shown
          there, so this stays responsive.
        </p>
        <div className="mc-controls">
          <Field label="Target success rate" hint="The Monte Carlo tab's own rough reading: 90%+ is solid, below 75% depends on luck">
            <PercentInput value={targetSuccess} onChange={(v) => setTargetSuccess(Math.min(Math.max(v, 0.01), 0.99))} />
          </Field>
        </div>
        <div className="stat-row">
          <StatTile
            label="Max sustainable Go-Go spending (Monte Carlo)"
            value={maxSpendMc !== null ? money(Math.floor(maxSpendMc / 1000) * 1000) : 'None'}
            detail={`vs ${money(inputs.goGoSpending)} planned (today's $) · target ${pct(targetSuccess, 0)} success`}
            tone={maxSpendMc !== null && maxSpendMc >= inputs.goGoSpending ? 'good' : 'bad'}
            hint="The most Go-Go spending that keeps Monte Carlo success at or above the target above — almost always lower than the deterministic answer, since it has to survive randomized bad-luck sequences, not just one fixed-return path"
          />
        </div>
      </div>

      <div className="card">
        <h3>What moves the needle</h3>
        <p className="card-note">One change at a time, everything else as planned.</p>
        <div className="table-scroll">
          <table className="year-table">
            <thead>
              <tr>
                <th>Change</th>
                <th title="Nominal dollars in the plan's final year">Final balance</th>
                <th title="That same final balance, deflated to today's purchasing power">In today's $</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{moneyCompact(row.finalBalance)}</td>
                  <td>{moneyCompact(row.finalBalanceReal)}</td>
                  <td>{row.runOutYear ? `⚠ Runs out ${row.runOutYear}` : '✓ Survives'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
