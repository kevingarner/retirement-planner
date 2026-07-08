import { useMemo } from 'react';
import type { PlanInputs, RothConversionPlan } from '../model/types';
import { runDetailedProjection } from '../model/detailed';
import { moneyCompact } from '../format';

interface StrategyResult {
  label: string;
  plan: RothConversionPlan;
  totalConverted: number;
  lifetimeTax: number;
  lifetimeAcaSubsidy: number;
  afterTaxEstateReal: number;
  runsOut: boolean;
  runOutYear: number | null;
}

export function RothExplorerPage({
  inputs,
  onApply,
}: {
  inputs: PlanInputs;
  onApply: (plan: RothConversionPlan) => void;
}) {
  const results: StrategyResult[] | null = useMemo(() => {
    if (inputs.taxMode !== 'detailed') return null;
    const base = inputs.detailed.rothConversion;
    const strategies: { label: string; plan: RothConversionPlan }[] = [
      { label: 'No conversions', plan: { ...base, mode: 'none' } },
      { label: 'Fill 12% bracket', plan: { ...base, mode: 'fillBracket', bracketTop: 0.12 } },
      { label: 'Fill 22% bracket', plan: { ...base, mode: 'fillBracket', bracketTop: 0.22 } },
      { label: 'Fill 24% bracket', plan: { ...base, mode: 'fillBracket', bracketTop: 0.24 } },
      { label: 'Stay under IRMAA tier 1', plan: { ...base, mode: 'fillIrmaa' } },
      ...(inputs.detailed.aca.enabled
        ? [{ label: 'Stay under ACA cliff (400% FPL)', plan: { ...base, mode: 'fillAca' } as RothConversionPlan }]
        : []),
    ];
    const yearsSpan = (r: { endYear: number }) => r.endYear - inputs.startYear;
    return strategies.map(({ label, plan }) => {
      const r = runDetailedProjection({ ...inputs, detailed: { ...inputs.detailed, rothConversion: plan } });
      return {
        label,
        plan,
        totalConverted: r.rows.reduce((s, row) => s + (row.detail?.rothConversion ?? 0), 0),
        lifetimeTax: r.lifetimeTax ?? 0,
        lifetimeAcaSubsidy: r.lifetimeAcaSubsidy ?? 0,
        afterTaxEstateReal: (r.afterTaxEstate ?? 0) / Math.pow(1 + inputs.inflation, yearsSpan(r)),
        runsOut: r.runsOut,
        runOutYear: r.runOutYear,
      };
    });
  }, [inputs]);

  if (!results) {
    return (
      <div className="dashboard">
        <div className="card">
          <h3>Roth conversion explorer</h3>
          <p className="card-note">
            This page needs the detailed tax model. Switch <strong>Taxes → Tax model</strong> to{' '}
            <strong>Detailed</strong> in the inputs panel, set up your account buckets, and come back.
          </p>
        </div>
      </div>
    );
  }

  const surviving = results.filter((r) => !r.runsOut);
  const best = (surviving.length ? surviving : results).reduce((a, b) =>
    b.afterTaxEstateReal > a.afterTaxEstateReal ? b : a,
  );
  const none = results[0];
  const active = inputs.detailed.rothConversion;

  return (
    <div className="dashboard">
      <div className="card">
        <h3>Roth conversion explorer</h3>
        <p className="card-note">
          Each strategy converts traditional → Roth during the conversion window (
          {active.startYear || 'first retirement year'} – {active.endYear || 'year before RMDs'}), paying tax now to
          avoid it later. Strategies are ranked by <strong>after-tax estate in today's dollars</strong> — what your
          money is worth after heirs pay tax on what's left in traditional accounts. ACA subsidies and IRMAA
          surcharges are part of every run, so the trade-off between converting and keeping MAGI low is priced in.
        </p>
        <div className="verdict good" style={{ fontSize: 17 }}>
          Best for this plan: {best.label} — {moneyCompact(best.afterTaxEstateReal)} after-tax estate
          {best.label !== none.label &&
            ` (${moneyCompact(best.afterTaxEstateReal - none.afterTaxEstateReal)} more than doing nothing)`}
        </div>
        <p className="card-note" style={{ marginTop: 10, marginBottom: 0 }}>
          Roth conversions are hard to fully undo and interact with tax brackets, IRMAA, and ACA subsidies in ways
          that are easy to get wrong. Treat this as a starting point for a conversation with a CPA or tax advisor
          before converting real money — not as an instruction to act on.
        </p>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="year-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Total converted</th>
                <th>Lifetime taxes</th>
                <th>Lifetime ACA subsidy</th>
                <th>After-tax estate (today's $)</th>
                <th>vs. no conversions</th>
                <th>Outcome</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const isActive =
                  r.plan.mode === active.mode && (r.plan.mode !== 'fillBracket' || r.plan.bracketTop === active.bracketTop);
                return (
                  <tr key={r.label} className={r.runsOut ? 'shortfall' : ''}>
                    <td>
                      {r.label}
                      {r.label === best.label && ' ⭐'}
                      {isActive && ' (current)'}
                    </td>
                    <td>{moneyCompact(r.totalConverted)}</td>
                    <td>{moneyCompact(r.lifetimeTax)}</td>
                    <td>{moneyCompact(r.lifetimeAcaSubsidy)}</td>
                    <td>{moneyCompact(r.afterTaxEstateReal)}</td>
                    <td>
                      {r.label === none.label
                        ? '—'
                        : `${r.afterTaxEstateReal >= none.afterTaxEstateReal ? '+' : '−'}${moneyCompact(Math.abs(r.afterTaxEstateReal - none.afterTaxEstateReal))}`}
                    </td>
                    <td>{r.runsOut ? `⚠ Runs out ${r.runOutYear}` : '✓ Survives'}</td>
                    <td>
                      {!isActive && (
                        <button className="link-btn" onClick={() => onApply(r.plan)}>
                          Apply
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="card-note" style={{ marginTop: 10 }}>
          Conversions interact: filling a high bracket raises MAGI, which can cost ACA subsidies before 65 and add
          IRMAA surcharges after. The "lifetime ACA subsidy" column shows what each strategy gives up. Bigger
          conversions look better the longer the money stays invested and the higher your heirs' tax rate.
        </p>
      </div>
    </div>
  );
}
