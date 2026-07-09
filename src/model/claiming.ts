import type { PlanInputs, ProjectionResult } from './types';
import { runPlan } from './detailed';

// Social Security claiming-age factors relative to PIA, FRA 67 (born 1960+)
export const CLAIM_FACTORS: Record<number, number> = {
  62: 0.7,
  63: 0.75,
  64: 0.8,
  65: 0.8667,
  66: 0.9333,
  67: 1.0,
  68: 1.08,
  69: 1.16,
  70: 1.24,
};

function factor(age: number): number {
  return CLAIM_FACTORS[Math.min(Math.max(Math.round(age), 62), 70)];
}

// The plan stores each person's benefit at their chosen start age. Convert to
// PIA, then to the benefit at another claiming age.
export function benefitAtAge(benefitAtCurrentStart: number, currentStartAge: number, newAge: number): number {
  return (benefitAtCurrentStart / factor(currentStartAge)) * factor(newAge);
}

export interface ClaimingStrategy {
  label: string;
  youAge: number;
  spouseAge: number;
}

export interface ClaimingResult extends ClaimingStrategy {
  lifetimeSS: number;
  finalBalance: number;
  runsOut: boolean;
  runOutYear: number | null;
  lifetimeTax?: number;
}

export function compareClaimingStrategies(inputs: PlanInputs): ClaimingResult[] {
  // Which spouse has the larger PIA determines the split strategy
  const youPia = inputs.you.ssAnnualBenefit / factor(inputs.you.ssStartAge);
  const spousePia = inputs.spouse.ssAnnualBenefit / factor(inputs.spouse.ssStartAge);
  const youIsHigher = youPia >= spousePia;

  const strategies: ClaimingStrategy[] = inputs.single
    ? [
        { label: 'Claim at 62', youAge: 62, spouseAge: 62 },
        { label: 'Claim at 67 (FRA)', youAge: 67, spouseAge: 67 },
        { label: 'Claim at 70', youAge: 70, spouseAge: 70 },
      ]
    : [
        { label: 'Both claim at 62', youAge: 62, spouseAge: 62 },
        { label: 'Both claim at 67 (FRA)', youAge: 67, spouseAge: 67 },
        { label: 'Both claim at 70', youAge: 70, spouseAge: 70 },
        youIsHigher
          ? { label: `${inputs.you.name} at 70, ${inputs.spouse.name} at 62`, youAge: 70, spouseAge: 62 }
          : { label: `${inputs.spouse.name} at 70, ${inputs.you.name} at 62`, youAge: 62, spouseAge: 70 },
      ];

  return strategies.map((s) => {
    // A claim age in the past isn't possible — floor at current age
    const youAge = Math.max(s.youAge, inputs.you.currentAge);
    const spouseAge = Math.max(s.spouseAge, inputs.spouse.currentAge);
    const variant: PlanInputs = {
      ...inputs,
      includeSS: true,
      you: { ...inputs.you, ssStartAge: youAge, ssAnnualBenefit: benefitAtAge(inputs.you.ssAnnualBenefit, inputs.you.ssStartAge, youAge) },
      spouse: {
        ...inputs.spouse,
        ssStartAge: spouseAge,
        ssAnnualBenefit: benefitAtAge(inputs.spouse.ssAnnualBenefit, inputs.spouse.ssStartAge, spouseAge),
      },
    };
    const r: ProjectionResult = runPlan(variant);
    return {
      ...s,
      youAge,
      spouseAge,
      lifetimeSS: r.totalLifetimeSS,
      finalBalance: r.finalBalance,
      runsOut: r.runsOut,
      runOutYear: r.runOutYear,
      lifetimeTax: r.lifetimeTax,
    };
  });
}
