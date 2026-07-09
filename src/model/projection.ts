import type { PlanInputs, ProjectionResult, YearRow, Phase, SpendingPhase } from './types';

// Annual Medicare cost per person in today's $ (Inputs C38/D38):
// (PartB * (1 + IRMAA%) + PartD + PartD-IRMAA) * 12
export function annualMedicareCost(p: {
  partBMonthly: number;
  partDMonthly: number;
  irmaaSurchargePct: number;
  partDIrmaaMonthly: number;
}): number {
  return (p.partBMonthly * (1 + p.irmaaSurchargePct) + p.partDMonthly + p.partDIrmaaMonthly) * 12;
}

export function retirementYear(inputs: PlanInputs, who: 'you' | 'spouse'): number {
  const p = inputs[who];
  return inputs.startYear + p.retirementAge - p.currentAge;
}

// Single-person plans reuse the couples engine with the spouse neutralized:
// zero income/premiums, and ages/eligibility mirroring "you" so every
// both-of-us condition (phase, Medicare step-down, SS start) keys off one
// person. Filing status, FPL household size, and IRMAA person-count need
// explicit guards in the detailed engine — zeroing can't express those.
export function effectiveInputs(inputs: PlanInputs): PlanInputs {
  if (!inputs.single) return inputs;
  return {
    ...inputs,
    survivorOn: false, // no second person whose death could be modeled
    spouse: {
      ...inputs.spouse,
      currentAge: inputs.you.currentAge,
      retirementAge: inputs.you.retirementAge,
      lifeExpectancy: inputs.you.lifeExpectancy,
      medicareEligibilityAge: inputs.you.medicareEligibilityAge,
      ssStartAge: inputs.you.ssStartAge,
      annualContribution: 0,
      ssAnnualBenefit: 0,
      partBMonthly: 0,
      partDMonthly: 0,
      irmaaSurchargePct: 0,
      partDIrmaaMonthly: 0,
    },
    detailed: {
      ...inputs.detailed,
      accounts: { ...inputs.detailed.accounts, traditionalSpouse: 0 },
    },
  };
}

// Calendar year SS starts for the earlier of the two spouses (Inputs C44)
export function ssStartYear(rawInputs: PlanInputs): number {
  const inputs = effectiveInputs(rawInputs);
  return Math.min(
    inputs.startYear + inputs.you.ssStartAge - inputs.you.currentAge,
    inputs.startYear + inputs.spouse.ssStartAge - inputs.spouse.currentAge,
  );
}

export function projectionEndYear(rawInputs: PlanInputs): number {
  const inputs = effectiveInputs(rawInputs);
  return (
    inputs.startYear +
    Math.max(
      inputs.you.lifeExpectancy - inputs.you.currentAge,
      inputs.spouse.lifeExpectancy - inputs.spouse.currentAge,
    )
  );
}

// Income/expense events active in a given year (amounts inflated per event setting)
export function eventFlows(
  inputs: PlanInputs,
  year: number,
  t: number,
): { income: number; taxableIncome: number; expense: number } {
  let income = 0;
  let taxableIncome = 0;
  let expense = 0;
  for (const e of inputs.events ?? []) {
    if (year < e.startYear || year > e.endYear) continue;
    const amt = e.amount * (e.inflationAdjust ? Math.pow(1 + inputs.inflation, t) : 1);
    if (e.kind === 'income') {
      income += amt;
      if (e.taxable) taxableIncome += amt;
    } else {
      expense += amt;
    }
  }
  return { income, taxableIncome, expense };
}

function ssBenefit(
  inputs: PlanInputs,
  who: 'you' | 'spouse',
  age: number,
  year: number,
): number {
  if (!inputs.includeSS) return 0;
  const p = inputs[who];
  if (age < p.ssStartAge) return 0;
  // Benefit inflated from today to the start age, then flat unless COLA is on.
  // A start age in the past means already claiming: the entered benefit is
  // today's actual check — no back-deflation, and COLA accrues from now.
  let b = p.ssAnnualBenefit * Math.pow(1 + inputs.inflation, Math.max(p.ssStartAge - p.currentAge, 0));
  if (inputs.ssColaOn) b *= Math.pow(1 + inputs.ssColaRate, age - Math.max(p.ssStartAge, p.currentAge));
  if (year >= inputs.ssCutStartYear) b *= 1 - inputs.ssCutPct;
  return b;
}

export function runProjection(rawInputs: PlanInputs, returnOverrides?: number[]): ProjectionResult {
  const inputs = effectiveInputs(rawInputs);
  const { startYear, you, spouse, inflation } = inputs;
  const endYear = projectionEndYear(inputs);
  const retYearYou = retirementYear(inputs, 'you');
  const retYearSpouse = retirementYear(inputs, 'spouse');
  const firstRetYear = Math.min(retYearYou, retYearSpouse);
  const ssYear = ssStartYear(inputs);
  const medicareYou = annualMedicareCost(you);
  const medicareSpouse = annualMedicareCost(spouse);

  const rows: YearRow[] = [];
  let prev: YearRow | null = null;
  // Guardrails state
  let spendMult = 1;
  let initialWR: number | null = null;

  for (let year = startYear; year <= endYear; year++) {
    const t = year - startYear;
    const yourAge = you.currentAge + t;
    const spouseAge = spouse.currentAge + t;
    const phase: Phase =
      yourAge < you.retirementAge && spouseAge < spouse.retirementAge
        ? 'Accumulation'
        : 'Retirement';
    const survivorActive = inputs.survivorOn && yourAge >= inputs.yourDeathAge;
    const inflFactor = Math.pow(1 + inflation, t);
    const withdrawInfl = inputs.inflationAdjustWithdrawals ? inflFactor : 1;
    const ev = eventFlows(inputs, year, t);

    // Contributions grow off the prior year's value (Projection E/F)
    const yourContribution =
      yourAge >= you.retirementAge
        ? 0
        : prev
          ? prev.yourContribution * (1 + you.contributionIncreasePct)
          : you.annualContribution;
    const spouseContribution =
      spouseAge >= spouse.retirementAge
        ? 0
        : prev
          ? prev.spouseContribution * (1 + spouse.contributionIncreasePct)
          : spouse.annualContribution;

    const yourSS = ssBenefit(inputs, 'you', yourAge, year);
    const spouseSS = ssBenefit(inputs, 'spouse', spouseAge, year);
    // Survivor keeps the larger of the two benefits (Projection I)
    const totalSS = survivorActive ? Math.max(yourSS, spouseSS) : yourSS + spouseSS;

    // Spending with Go-Go / Slow-Go / No-Go phases (Projection J). The phase
    // portion is subject to the guardrails multiplier; one-time and event
    // expenses are not.
    let phaseSpending = 0;
    let spendingPhase: SpendingPhase = '';
    if (phase === 'Retirement') {
      const phaseMult =
        yourAge <= inputs.goGoEndAge
          ? 1
          : yourAge <= inputs.slowGoEndAge
            ? 1 + inputs.slowGoReductionPct
            : 1 + inputs.slowGoReductionPct + inputs.noGoAdditionalReductionPct;
      spendingPhase =
        yourAge <= inputs.goGoEndAge ? 'Go-Go' : yourAge <= inputs.slowGoEndAge ? 'Slow-Go' : 'No-Go';
      phaseSpending =
        inputs.goGoSpending * phaseMult * withdrawInfl * (survivorActive ? 1 + inputs.survivorSpendingChangePct : 1);
    }
    let extras = ev.expense;
    if (year === inputs.oneTimeExpenseYear) {
      extras += inputs.oneTimeExpense * withdrawInfl;
    }

    // Medicare (Projection K): deceased spouse's premiums stop in survivor mode
    const medGrowth = Math.pow(1 + inputs.medicarePremiumGrowth, t);
    const medicare =
      (survivorActive ? 0 : yourAge >= you.medicareEligibilityAge ? medicareYou * medGrowth : 0) +
      (spouseAge >= spouse.medicareEligibilityAge ? medicareSpouse * medGrowth : 0);

    // Pre-Medicare insurance (Projection L)
    let preMedicareInsurance = 0;
    if (phase === 'Retirement') {
      const bothOnMedicare =
        yourAge >= you.medicareEligibilityAge && spouseAge >= spouse.medicareEligibilityAge;
      const oneOnMedicare =
        yourAge >= you.medicareEligibilityAge || spouseAge >= spouse.medicareEligibilityAge;
      preMedicareInsurance =
        inputs.preMedicarePremium *
        inflFactor *
        (bothOnMedicare ? 0 : oneOnMedicare ? inputs.premiumPctAfterFirstMedicare : 1);
    }

    // Long-term care event (Projection T)
    const ltcCost =
      inputs.ltcOn && yourAge >= inputs.ltcStartAge && yourAge <= inputs.ltcStartAge + inputs.ltcYears - 1
        ? inputs.ltcAnnualCost * inflFactor
        : 0;

    // Effective tax rate for the year (gross-up on draws, Projection M/N)
    const taxRate = survivorActive
      ? inputs.survivorTaxRate
      : inputs.includeSS && year >= ssYear
        ? inputs.taxRatePostSS
        : inputs.taxRatePreSS;

    const beginBalance = prev ? prev.endBalance : inputs.currentBalance;

    // Draw for a given guardrails multiplier. SS beyond needs is discarded
    // (Excel behavior); event income beyond needs is reinvested (surplus).
    const computeDraw = (mult: number) => {
      const spend = phaseSpending * mult + extras;
      const needPreTax = spend + medicare + preMedicareInsurance + ltcCost - totalSS;
      const afterEvents = Math.max(needPreTax, 0) - ev.income;
      return {
        spend,
        draw: Math.max(afterEvents / (1 - taxRate), 0),
        surplus: Math.max(-afterEvents, 0),
      };
    };

    let flows = computeDraw(spendMult);
    if (inputs.withdrawalStrategy === 'guardrails' && phase === 'Retirement' && beginBalance > 0) {
      const wr = flows.draw / beginBalance;
      if (initialWR === null) {
        if (flows.draw > 0) initialWR = wr;
      } else if (wr > initialWR * (1 + inputs.guardrails.band)) {
        spendMult *= 1 - inputs.guardrails.adjustment;
        flows = computeDraw(spendMult);
      } else if (wr < initialWR * (1 - inputs.guardrails.band)) {
        spendMult *= 1 + inputs.guardrails.adjustment;
        flows = computeDraw(spendMult);
      }
    }
    const portfolioDraw = flows.draw;
    const estimatedTaxes = portfolioDraw === 0 ? 0 : portfolioDraw * taxRate;

    // Rate of return (Projection O): stress overrides the first 4 retirement years
    let rateOfReturn: number;
    if (returnOverrides && returnOverrides[t] !== undefined) {
      rateOfReturn = returnOverrides[t];
    } else if (phase === 'Accumulation') {
      rateOfReturn = inputs.returnAccumulation;
    } else if (inputs.stressTestOn && year >= firstRetYear && year <= firstRetYear + 3) {
      rateOfReturn = inputs.stressReturns[year - firstRetYear];
    } else {
      rateOfReturn = inputs.returnRetirement;
    }

    // Cash reserve bucket (Projection U): reserve earns its own yield instead of
    // the portfolio return — modeled as an adjustment on the reserve slice (Q).
    const cashReserve =
      inputs.cashReserveOn && phase === 'Retirement'
        ? Math.min(inputs.cashReserveYears * portfolioDraw, beginBalance)
        : 0;

    const endBalance = Math.max(
      beginBalance * (1 + rateOfReturn) +
        yourContribution +
        spouseContribution -
        portfolioDraw +
        flows.surplus +
        cashReserve * (inputs.cashReserveYield - rateOfReturn),
      0,
    );

    const row: YearRow = {
      year,
      yourAge,
      spouseAge,
      phase,
      yourContribution,
      spouseContribution,
      yourSS,
      spouseSS,
      totalSS,
      spending: flows.spend,
      medicare,
      preMedicareInsurance,
      ltcCost,
      portfolioDraw,
      estimatedTaxes,
      rateOfReturn,
      beginBalance,
      endBalance,
      onTrack: endBalance > 0,
      spendingPhase,
      cashReserve,
      endBalanceReal: endBalance / inflFactor,
    };
    rows.push(row);
    prev = row;
  }

  const retRow = rows.find((r) => r.year === retYearYou);
  const runOutRow = rows.find((r) => r.endBalance === 0);
  let peak = rows[0];
  for (const r of rows) if (r.endBalance > peak.endBalance) peak = r;

  return {
    rows,
    balanceAtRetirement: retRow ? retRow.beginBalance : null,
    finalBalance: rows[rows.length - 1].endBalance,
    runsOut: !!runOutRow,
    runOutYear: runOutRow ? runOutRow.year : null,
    peakBalanceYear: peak.year,
    totalLifetimeSS: rows.reduce((s, r) => s + r.totalSS, 0),
    retirementYearYou: retYearYou,
    retirementYearSpouse: retYearSpouse,
    endYear,
  };
}
