import type { PlanInputs, RothConversionPlan } from './types';
import { runDetailedProjection } from './detailed';

export interface RothStrategyResult {
  label: string;
  plan: RothConversionPlan;
  totalConverted: number;
  lifetimeTax: number;
  lifetimeAcaSubsidy: number;
  afterTaxEstateReal: number;
  runsOut: boolean;
  runOutYear: number | null;
}

// Shared by the Roth Explorer page and the printable Report so both show
// identical numbers instead of two independent computations drifting apart.
// Returns null outside detailed tax mode — Roth conversions aren't modeled
// in the simple engine.
export function compareRothStrategies(inputs: PlanInputs): RothStrategyResult[] | null {
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
}
