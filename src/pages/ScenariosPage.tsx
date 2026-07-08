import { useMemo, useState } from 'react';
import type { PlanInputs } from '../model/types';
import { runPlan } from '../model/detailed';
import type { Scenario } from '../state/storage';
import type { Theme } from '../theme';
import { moneyCompact } from '../format';
import { ScenarioOverlayChart, type OverlaySeries } from '../components/charts';

interface Props {
  inputs: PlanInputs;
  scenarios: Scenario[];
  theme: Theme;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  onLoad: (scenario: Scenario) => void;
}

export function ScenariosPage({ inputs, scenarios, theme, onSave, onDelete, onLoad }: Props) {
  const [name, setName] = useState('');
  const [realDollars, setRealDollars] = useState(false);

  const series: OverlaySeries[] = useMemo(() => {
    const all = [
      { name: 'Current plan', inputs },
      ...scenarios.map((s) => ({ name: s.name, inputs: s.inputs })),
    ];
    // Color follows the entity: current plan is always slot 1; saved scenarios
    // keep the slot they were assigned at save time (creation order).
    return all.slice(0, 8).map((s, i) => {
      const result = runPlan(s.inputs);
      return {
        name: s.name,
        color: theme.series[i],
        rows: result.rows.map((r) => ({ year: r.year, balance: realDollars ? r.endBalanceReal : r.endBalance })),
      };
    });
  }, [inputs, scenarios, theme, realDollars]);

  const summaries = useMemo(
    () =>
      [{ id: null as string | null, name: 'Current plan', inputs }, ...scenarios.map((s) => ({ id: s.id as string | null, name: s.name, inputs: s.inputs }))].map(
        (s) => {
          const r = runPlan(s.inputs);
          return {
            id: s.id,
            name: s.name,
            retire: r.retirementYearYou,
            atRetirement: r.balanceAtRetirement,
            final: r.finalBalance,
            runsOut: r.runsOut,
            runOutYear: r.runOutYear,
          };
        },
      ),
    [inputs, scenarios],
  );

  return (
    <div className="dashboard">
      <div className="card">
        <h3>Scenarios</h3>
        <p className="card-note">
          Snapshot the current inputs under a name, then tweak the plan and compare. Up to 7 saved scenarios overlay
          alongside the current plan.
        </p>
        <div className="scenario-save">
          <input
            className="num name"
            placeholder="Scenario name (e.g. Retire at 60)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                onSave(name.trim());
                setName('');
              }
            }}
          />
          <button
            className="btn"
            disabled={!name.trim() || scenarios.length >= 7}
            onClick={() => {
              onSave(name.trim());
              setName('');
            }}
          >
            Save current inputs
          </button>
        </div>
      </div>

      <div className="card">
        <div className="chart-header">
          <h3>Balance comparison</h3>
          <label className="check-label">
            <input type="checkbox" checked={realDollars} onChange={(e) => setRealDollars(e.target.checked)} />
            Show in today's dollars
          </label>
        </div>
        <ScenarioOverlayChart series={series} theme={theme} />
      </div>

      <div className="card">
        <h3>Side by side</h3>
        <div className="table-scroll">
          <table className="year-table">
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Retirement year</th>
                <th>At retirement</th>
                <th>Final balance</th>
                <th>Outcome</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s, i) => (
                <tr key={s.id ?? 'current'}>
                  <td>
                    <span className="swatch" style={{ background: theme.series[i] }} />
                    {s.name}
                  </td>
                  <td>{s.retire}</td>
                  <td>{s.atRetirement !== null ? moneyCompact(s.atRetirement) : '—'}</td>
                  <td>{moneyCompact(s.final)}</td>
                  <td>{s.runsOut ? `⚠ Runs out ${s.runOutYear}` : '✓ Survives'}</td>
                  <td>
                    {s.id !== null && (
                      <>
                        <button className="link-btn" onClick={() => onLoad(scenarios.find((x) => x.id === s.id)!)}>
                          Load
                        </button>{' '}
                        <button className="link-btn danger" onClick={() => onDelete(s.id!)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
