import { useMemo } from 'react';
import type { PlanInputs } from '../model/types';
import { maxSustainableSpending, earliestRetirementAge, requiredRetirementReturn, oneWaySensitivity } from '../model/sensitivity';
import { money, moneyCompact, pct } from '../format';
import { StatTile } from '../components/ui';

export function SensitivityPage({ inputs }: { inputs: PlanInputs }) {
  const maxSpend = useMemo(() => maxSustainableSpending(inputs), [inputs]);
  const earliestAge = useMemo(() => earliestRetirementAge(inputs), [inputs]);
  const requiredReturn = useMemo(() => requiredRetirementReturn(inputs), [inputs]);
  const table = useMemo(() => oneWaySensitivity(inputs), [inputs]);

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
          />
          <StatTile
            label={`Earliest retirement age (${inputs.you.name})`}
            value={earliestAge !== null ? String(earliestAge) : 'Never'}
            detail={`vs ${inputs.you.retirementAge} planned · spouse shifts by the same years`}
            tone={earliestAge !== null && earliestAge <= inputs.you.retirementAge ? 'good' : 'bad'}
          />
          <StatTile
            label="Required return in retirement"
            value={requiredReturn !== null ? pct(requiredReturn, 2) : '> 15%'}
            detail={`vs ${pct(inputs.returnRetirement, 1)} assumed`}
            tone={requiredReturn !== null && requiredReturn <= inputs.returnRetirement ? 'good' : 'bad'}
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
                <th>Final balance</th>
                <th>In today's $</th>
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
