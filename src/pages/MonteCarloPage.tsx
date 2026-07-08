import { useMemo, useState } from 'react';
import type { PlanInputs } from '../model/types';
import { runMonteCarlo, defaultMonteCarloParams, type MonteCarloParams } from '../model/montecarlo';
import type { Theme } from '../theme';
import { pct, moneyCompact } from '../format';
import { StatTile, Field, IntInput, PercentInput } from '../components/ui';
import { MonteCarloChart } from '../components/charts';

export function MonteCarloPage({ inputs, theme }: { inputs: PlanInputs; theme: Theme }) {
  const [params, setParams] = useState<MonteCarloParams>(defaultMonteCarloParams);
  const set = (patch: Partial<MonteCarloParams>) => setParams({ ...params, ...patch });

  const mc = useMemo(() => runMonteCarlo(inputs, params), [inputs, params]);

  const medianRunOut = useMemo(() => {
    const failures = mc.runOutYears.filter((y): y is number => y !== null).sort((a, b) => a - b);
    return failures.length ? failures[Math.floor(failures.length / 2)] : null;
  }, [mc]);

  return (
    <div className="dashboard">
      <div className="card">
        <h3>Monte Carlo settings</h3>
        <p className="card-note">
          Instead of one fixed return, each simulation draws a random return every year (normal distribution around
          your plan's rates). The deterministic stress-test toggle is ignored here — randomness replaces it.
        </p>
        <div className="mc-controls">
          <Field label="Simulations">
            <IntInput value={params.simulations} onChange={(v) => set({ simulations: Math.max(100, Math.min(v, 5000)) })} />
          </Field>
          <Field label="Volatility while working" hint="Std. dev. of annual returns — ~15% for a stock-heavy mix">
            <PercentInput value={params.volatilityAccumulation} onChange={(v) => set({ volatilityAccumulation: v })} />
          </Field>
          <Field label="Volatility in retirement" hint="~10% for a balanced mix">
            <PercentInput value={params.volatilityRetirement} onChange={(v) => set({ volatilityRetirement: v })} />
          </Field>
        </div>
      </div>

      <div className="stat-row">
        <StatTile
          label="Success rate"
          value={pct(mc.successRate, 1)}
          detail={`money lasts to ${inputs.startYear + Math.max(inputs.you.lifeExpectancy - inputs.you.currentAge, inputs.spouse.lifeExpectancy - inputs.spouse.currentAge)} in ${Math.round(mc.successRate * params.simulations)} of ${params.simulations} runs`}
          tone={mc.successRate >= 0.85 ? 'good' : mc.successRate < 0.7 ? 'bad' : undefined}
        />
        <StatTile label="Median final balance" value={moneyCompact(mc.medianFinalBalance)} />
        <StatTile
          label="Median failure year"
          value={medianRunOut !== null ? String(medianRunOut) : '—'}
          detail={medianRunOut !== null ? 'among failing runs only' : 'no failing runs'}
        />
      </div>

      <div className="card">
        <h3>Range of outcomes</h3>
        <MonteCarloChart mc={mc} theme={theme} />
      </div>
    </div>
  );
}
