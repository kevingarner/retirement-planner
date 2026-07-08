import { useMemo, useState } from 'react';
import type { PlanInputs } from '../model/types';
import { runPlan } from '../model/detailed';
import type { Theme } from '../theme';
import { moneyCompact } from '../format';
import { StatTile } from '../components/ui';
import { BalanceChart, CashflowChart, AccountChart } from '../components/charts';
import { YearTable } from '../components/YearTable';

export function Dashboard({ inputs, theme }: { inputs: PlanInputs; theme: Theme }) {
  const result = useMemo(() => runPlan(inputs), [inputs]);
  const [showTable, setShowTable] = useState(false);

  const yourAgeAtRunOut =
    result.runOutYear !== null ? result.runOutYear - inputs.startYear + inputs.you.currentAge : null;

  return (
    <div className="dashboard">
      <div className="verdict-row">
        <div className={`verdict ${result.runsOut ? 'bad' : 'good'}`}>
          {result.runsOut
            ? `Portfolio runs out in ${result.runOutYear} (your age ${yourAgeAtRunOut})`
            : `Portfolio survives to ${result.endYear}`}
        </div>
      </div>

      <div className="stat-row">
        <StatTile
          label="At retirement"
          value={result.balanceAtRetirement !== null ? moneyCompact(result.balanceAtRetirement) : '—'}
          detail={`retirement starts ${result.retirementYearYou}`}
        />
        <StatTile
          label="Final balance"
          value={moneyCompact(result.finalBalance)}
          detail={`${result.endYear} · ${moneyCompact(result.rows[result.rows.length - 1].endBalanceReal)} today's $`}
          tone={result.finalBalance > 0 ? 'good' : 'bad'}
        />
        <StatTile label="Peak balance year" value={String(result.peakBalanceYear)} />
        <StatTile
          label="Lifetime Social Security"
          value={moneyCompact(result.totalLifetimeSS)}
          detail={inputs.includeSS ? 'included in plan' : 'excluded from plan'}
        />
      </div>

      {inputs.taxMode === 'detailed' && result.lifetimeTax !== undefined && (
        <div className="stat-row">
          <StatTile label="Lifetime taxes" value={moneyCompact(result.lifetimeTax)} detail="federal + state, nominal" />
          <StatTile
            label="Lifetime ACA subsidies"
            value={moneyCompact(result.lifetimeAcaSubsidy ?? 0)}
            detail={inputs.detailed.aca.enabled ? `${inputs.detailed.aca.rules === 'cliff' ? '400% FPL cliff' : 'enhanced'} rules` : 'ACA modeling off'}
          />
          <StatTile
            label="After-tax estate"
            value={moneyCompact(result.afterTaxEstate ?? 0)}
            detail={`traditional $ taxed at ${Math.round(inputs.detailed.heirTaxRate * 100)}% to heirs`}
          />
          <StatTile
            label="Roth conversions"
            value={moneyCompact(result.rows.reduce((s, r) => s + (r.detail?.rothConversion ?? 0), 0))}
            detail={inputs.detailed.rothConversion.mode === 'none' ? 'no strategy set' : 'total converted'}
          />
        </div>
      )}

      {inputs.taxMode === 'detailed' && (
        <div className="card">
          <h3>Account composition</h3>
          <AccountChart result={result} theme={theme} />
        </div>
      )}

      <div className="card">
        <h3>Portfolio balance</h3>
        <BalanceChart result={result} theme={theme} />
      </div>

      <div className="card">
        <h3>Retirement cash flows</h3>
        <p className="card-note">Annual outflows stacked; Social Security income overlaid.</p>
        <CashflowChart result={result} theme={theme} />
      </div>

      <div className="card">
        <button className="link-btn" onClick={() => setShowTable(!showTable)}>
          {showTable ? '▾ Hide' : '▸ Show'} year-by-year table
        </button>
        {showTable && <YearTable result={result} />}
      </div>
    </div>
  );
}
