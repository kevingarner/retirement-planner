import type { PlanInputs, ProjectionResult, YearRow, Phase, SpendingPhase, YearDetail } from './types';
import { runProjection, retirementYear, projectionEndYear, eventFlows, effectiveInputs } from './projection';
import { householdTax, acaSubsidy, irmaaAnnualSurcharge } from './tax/federal';
import {
  BASE_YEAR,
  ORDINARY_BRACKETS,
  STANDARD_DEDUCTION,
  IRMAA_TIERS,
  ACA_CLIFF_MULTIPLE,
  FPL_HOUSEHOLD_1,
  FPL_HOUSEHOLD_2,
  uniformLifetimeFactor,
  type FilingStatus,
} from './tax/constants';

// Tax-aware projection: separate taxable / traditional / Roth buckets, real
// federal brackets, RMDs, Roth conversion strategies, ACA subsidies, and
// MAGI-driven IRMAA. Shares the spending/SS/LTC/return/cash-reserve logic of
// the simple engine; the reserve slice lives inside the taxable account.

interface Buckets {
  taxable: number;
  taxableBasis: number;
  tradYou: number;
  tradSpouse: number;
  roth: number;
}

function bracketTopFor(rate: number, status: FilingStatus, indexFactor: number): number {
  const b = ORDINARY_BRACKETS[status].find((x) => x.rate === rate);
  if (!b || b.upTo === Infinity) return Infinity;
  return b.upTo * indexFactor;
}

function ssBenefitDetailed(inputs: PlanInputs, who: 'you' | 'spouse', age: number, year: number): number {
  if (!inputs.includeSS) return 0;
  const p = inputs[who];
  if (age < p.ssStartAge) return 0;
  // Start age in the past = already claiming; see ssBenefit in projection.ts
  let b = p.ssAnnualBenefit * Math.pow(1 + inputs.inflation, Math.max(p.ssStartAge - p.currentAge, 0));
  if (inputs.ssColaOn) b *= Math.pow(1 + inputs.ssColaRate, age - Math.max(p.ssStartAge, p.currentAge));
  if (year >= inputs.ssCutStartYear) b *= 1 - inputs.ssCutPct;
  return b;
}

export function runDetailedProjection(rawInputs: PlanInputs, returnOverrides?: number[]): ProjectionResult {
  const inputs = effectiveInputs(rawInputs);
  const { startYear, you, spouse, inflation, detailed: d } = inputs;
  const endYear = projectionEndYear(inputs);
  const retYearYou = retirementYear(inputs, 'you');
  const retYearSpouse = retirementYear(inputs, 'spouse');
  const firstRetYear = Math.min(retYearYou, retYearSpouse);

  // Roth conversion window (0 = auto)
  const rmdYearYou = startYear + d.rmdStartAgeYou - you.currentAge;
  const rmdYearSpouse = startYear + d.rmdStartAgeSpouse - spouse.currentAge;
  const convStart = d.rothConversion.startYear || firstRetYear;
  const convEnd = d.rothConversion.endYear || Math.min(rmdYearYou, rmdYearSpouse) - 1;

  const buckets: Buckets = {
    taxable: d.accounts.taxable,
    taxableBasis: d.accounts.taxable * d.accounts.taxableBasisPct,
    tradYou: d.accounts.traditionalYou,
    tradSpouse: d.accounts.traditionalSpouse,
    roth: d.accounts.roth,
  };

  const rows: YearRow[] = [];
  const magiHistory: number[] = [];
  let prev: YearRow | null = null;
  let lifetimeTax = 0;
  let lifetimeAcaSubsidy = 0;
  // Guardrails state
  let spendMult = 1;
  let initialWR: number | null = null;

  for (let year = startYear; year <= endYear; year++) {
    const t = year - startYear;
    const yourAge = you.currentAge + t;
    const spouseAge = spouse.currentAge + t;
    const phase: Phase =
      yourAge < you.retirementAge && spouseAge < spouse.retirementAge ? 'Accumulation' : 'Retirement';
    const survivorActive = inputs.survivorOn && yourAge >= inputs.yourDeathAge;
    const status: FilingStatus = inputs.single || survivorActive ? 'single' : 'mfj';
    const inflFactor = Math.pow(1 + inflation, t);
    const withdrawInfl = inputs.inflationAdjustWithdrawals ? inflFactor : 1;
    const indexFactor = Math.pow(1 + inflation, Math.max(year - BASE_YEAR, 0));

    // Contributions (same recurrence as the simple engine)
    const yourContribution =
      yourAge >= you.retirementAge ? 0 : prev ? prev.yourContribution * (1 + you.contributionIncreasePct) : you.annualContribution;
    const spouseContribution =
      spouseAge >= spouse.retirementAge ? 0 : prev ? prev.spouseContribution * (1 + spouse.contributionIncreasePct) : spouse.annualContribution;

    const yourSS = ssBenefitDetailed(inputs, 'you', yourAge, year);
    const spouseSS = ssBenefitDetailed(inputs, 'spouse', spouseAge, year);
    const totalSS = survivorActive ? Math.max(yourSS, spouseSS) : yourSS + spouseSS;

    // Spending phases (guardrails multiplier applies to this portion only) +
    // one-time and event expenses
    const ev = eventFlows(inputs, year, t);
    let phaseSpending = 0;
    let spendingPhase: SpendingPhase = '';
    if (phase === 'Retirement') {
      const phaseMult =
        yourAge <= inputs.goGoEndAge
          ? 1
          : yourAge <= inputs.slowGoEndAge
            ? 1 + inputs.slowGoReductionPct
            : 1 + inputs.slowGoReductionPct + inputs.noGoAdditionalReductionPct;
      spendingPhase = yourAge <= inputs.goGoEndAge ? 'Go-Go' : yourAge <= inputs.slowGoEndAge ? 'Slow-Go' : 'No-Go';
      phaseSpending =
        inputs.goGoSpending * phaseMult * withdrawInfl * (survivorActive ? 1 + inputs.survivorSpendingChangePct : 1);
    }
    let extras = ev.expense;
    if (year === inputs.oneTimeExpenseYear) extras += inputs.oneTimeExpense * withdrawInfl;

    // LTC event
    const ltcCost =
      inputs.ltcOn && yourAge >= inputs.ltcStartAge && yourAge <= inputs.ltcStartAge + inputs.ltcYears - 1
        ? inputs.ltcAnnualCost * inflFactor
        : 0;

    // Medicare base premiums (no manual IRMAA inputs in this mode — IRMAA is computed)
    const medGrowth = Math.pow(1 + inputs.medicarePremiumGrowth, t);
    const youOnMedicare = yourAge >= you.medicareEligibilityAge && !survivorActive;
    // In single mode the mirrored spouse would double the IRMAA person-count
    const spouseOnMedicare = !inputs.single && spouseAge >= spouse.medicareEligibilityAge;
    const medicareBase =
      (youOnMedicare ? (you.partBMonthly + you.partDMonthly) * 12 * medGrowth : 0) +
      (spouseOnMedicare ? (spouse.partBMonthly + spouse.partDMonthly) * 12 * medGrowth : 0);
    const personsOnMedicare = (youOnMedicare ? 1 : 0) + (spouseOnMedicare ? 1 : 0);

    // Pre-Medicare insurance, gross (before any ACA subsidy)
    let grossPremium = 0;
    if (phase === 'Retirement') {
      const bothOnMedicare = yourAge >= you.medicareEligibilityAge && spouseAge >= spouse.medicareEligibilityAge;
      const oneOnMedicare = yourAge >= you.medicareEligibilityAge || spouseAge >= spouse.medicareEligibilityAge;
      grossPremium =
        inputs.preMedicarePremium * inflFactor * (bothOnMedicare ? 0 : oneOnMedicare ? inputs.premiumPctAfterFirstMedicare : 1);
    }

    // Rate of return (same override/stress logic as simple)
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

    // Grow buckets, then add contributions
    const beginBalance = buckets.taxable + buckets.tradYou + buckets.tradSpouse + buckets.roth;
    buckets.taxable *= 1 + rateOfReturn;
    buckets.tradYou *= 1 + rateOfReturn;
    buckets.tradSpouse *= 1 + rateOfReturn;
    buckets.roth *= 1 + rateOfReturn;

    const split = d.contributionSplit;
    buckets.tradYou += yourContribution * split.traditional;
    buckets.tradSpouse += spouseContribution * split.traditional;
    buckets.roth += (yourContribution + spouseContribution) * split.roth;
    const taxableContrib = (yourContribution + spouseContribution) * split.taxable;
    buckets.taxable += taxableContrib;
    buckets.taxableBasis += taxableContrib;

    // Dividend/interest yield thrown off by the taxable account this year —
    // taxed annually as qualified income and reinvested (raises basis)
    const dividendYield = buckets.taxable * d.taxableYieldPct;
    buckets.taxableBasis += dividendYield;

    // RMDs — forced traditional withdrawals (on grown balances)
    const rmdYou = !survivorActive && yourAge >= d.rmdStartAgeYou ? buckets.tradYou / uniformLifetimeFactor(yourAge) : 0;
    // Survivor simplification: spouse inherits your traditional account; her RMDs apply to the combined balance
    const rmdSpouse = spouseAge >= d.rmdStartAgeSpouse ? (buckets.tradSpouse + (survivorActive ? buckets.tradYou : 0)) / uniformLifetimeFactor(spouseAge) : 0;
    const rmd = rmdYou + rmdSpouse;

    // Fixed-point iteration: taxes ↔ withdrawals ↔ ACA subsidy ↔ conversions.
    // Wrapped in a function so guardrails can re-solve with adjusted spending.
    const fplBase = inputs.single || survivorActive ? FPL_HOUSEHOLD_1 : FPL_HOUSEHOLD_2;
    const fpl = fplBase * inflFactor;
    const inConversionWindow =
      d.rothConversion.mode !== 'none' && year >= convStart && year <= convEnd && buckets.tradYou + buckets.tradSpouse > 0;

    const solve = (mult: number) => {
      const spend = phaseSpending * mult + extras;
      let conversion = 0;
      let tradExtra = 0;
      let taxableWithdraw = 0;
      let rothWithdraw = 0;
      let realizedGains = 0;
      let taxRes = householdTax({ ordinaryIncome: 0, investmentIncome: 0, ssBenefit: 0, status, indexFactor, stateRate: d.stateTaxRate });
      let subsidy = 0;
      let irmaa = { tier: 0, annualSurcharge: 0 };
      let shortfall = false;
      let cashNeed = 0;

      for (let iter = 0; iter < 40; iter++) {
        const ordinaryIncome = rmd + tradExtra + conversion + ev.taxableIncome;
        const investmentIncome = dividendYield + realizedGains;
        taxRes = householdTax({ ordinaryIncome, investmentIncome, ssBenefit: totalSS, status, indexFactor, stateRate: d.stateTaxRate });

        // IRMAA from MAGI two years back (first two years: use current MAGI)
        const lookback = t >= 2 ? magiHistory[t - 2] : taxRes.magi;
        irmaa = irmaaAnnualSurcharge(lookback, status, indexFactor);
        const irmaaAnnual = irmaa.annualSurcharge * medGrowth * personsOnMedicare;

        // ACA subsidy on the pre-Medicare premium (grossPremium as the benchmark)
        subsidy = d.aca.enabled && grossPremium > 0 ? Math.min(acaSubsidy(taxRes.magi, grossPremium, fpl, d.aca.rules), grossPremium) : 0;
        const netPremium = grossPremium - subsidy;

        cashNeed = spend + medicareBase + irmaaAnnual + netPremium + ltcCost + taxRes.total - totalSS - ev.income;

        // Roth conversion strategy (nominal-year targets)
        if (inConversionWindow) {
          const otherOrdinary = rmd + tradExtra + ev.taxableIncome;
          let target = 0;
          switch (d.rothConversion.mode) {
            case 'fixed':
              conversion = d.rothConversion.amount * inflFactor;
              break;
            case 'fillBracket': {
              target = bracketTopFor(d.rothConversion.bracketTop, status, indexFactor) + STANDARD_DEDUCTION[status] * indexFactor;
              conversion = Math.max(target - (otherOrdinary + taxRes.taxableSS + dividendYield + realizedGains), 0);
              break;
            }
            case 'fillIrmaa': {
              target = IRMAA_TIERS[status][0].magiUpTo * indexFactor;
              conversion = Math.max(target - (taxRes.magi - conversion), 0);
              break;
            }
            case 'fillAca': {
              target = ACA_CLIFF_MULTIPLE * fpl;
              conversion = Math.max(target - (taxRes.magi - conversion), 0);
              break;
            }
          }
          conversion = Math.min(conversion, buckets.tradYou + buckets.tradSpouse);
        }

        // Allocate withdrawals to cover cashNeed (RMD cash arrives regardless)
        let need = Math.max(cashNeed, 0) - rmd;
        taxableWithdraw = 0;
        tradExtra = 0;
        rothWithdraw = 0;
        shortfall = false;
        if (need > 0) {
          const order: ('taxable' | 'trad' | 'roth')[] =
            d.withdrawalOrder === 'trad-taxable-roth' ? ['trad', 'taxable', 'roth'] : ['taxable', 'trad', 'roth'];
          for (const src of order) {
            if (need <= 0) break;
            if (src === 'taxable') {
              taxableWithdraw = Math.min(need, buckets.taxable);
              need -= taxableWithdraw;
            } else if (src === 'trad') {
              tradExtra = Math.min(need, buckets.tradYou + buckets.tradSpouse - rmd - conversion);
              tradExtra = Math.max(tradExtra, 0);
              need -= tradExtra;
            } else {
              rothWithdraw = Math.min(need, buckets.roth);
              need -= rothWithdraw;
            }
          }
          if (need > 1) shortfall = true;
        }

        // Realized gains from the taxable sale (proportional basis)
        const gainFraction = buckets.taxable > 0 ? Math.max(1 - buckets.taxableBasis / buckets.taxable, 0) : 0;
        realizedGains = taxableWithdraw * gainFraction;
      }

      return { spend, conversion, tradExtra, taxableWithdraw, rothWithdraw, taxRes, subsidy, irmaa, shortfall, cashNeed };
    };

    let sol = solve(spendMult);
    if (inputs.withdrawalStrategy === 'guardrails' && phase === 'Retirement' && beginBalance > 0) {
      const grossOut = Math.max(sol.cashNeed, 0);
      const wr = grossOut / beginBalance;
      if (initialWR === null) {
        if (grossOut > 0) initialWR = wr;
      } else if (wr > initialWR * (1 + inputs.guardrails.band)) {
        spendMult *= 1 - inputs.guardrails.adjustment;
        sol = solve(spendMult);
      } else if (wr < initialWR * (1 - inputs.guardrails.band)) {
        spendMult *= 1 + inputs.guardrails.adjustment;
        sol = solve(spendMult);
      }
    }
    const { spend: spending, conversion, tradExtra, taxableWithdraw, rothWithdraw, taxRes, subsidy, irmaa, shortfall } = sol;

    // Apply the year's flows to the buckets
    const totalTrad = buckets.tradYou + buckets.tradSpouse;
    const tradOut = Math.min(rmd + tradExtra + conversion, totalTrad);
    if (totalTrad > 0) {
      buckets.tradYou -= (buckets.tradYou / totalTrad) * tradOut;
      buckets.tradSpouse -= (buckets.tradSpouse / totalTrad) * tradOut;
    }
    buckets.roth += conversion - rothWithdraw;
    const gainFraction = buckets.taxable > 0 ? Math.max(1 - buckets.taxableBasis / buckets.taxable, 0) : 0;
    buckets.taxable -= taxableWithdraw;
    buckets.taxableBasis -= taxableWithdraw * (1 - gainFraction);

    // RMD cash beyond spending needs is reinvested in taxable, and so is any
    // year-level cash surplus (SS or event income exceeding all needs)
    const irmaaAnnual = irmaa.annualSurcharge * medGrowth * personsOnMedicare;
    const netPremium = grossPremium - subsidy;
    const excessRmd = Math.max(rmd - Math.max(sol.cashNeed, 0), 0);
    const surplus = Math.max(-sol.cashNeed, 0);
    buckets.taxable += excessRmd + surplus;
    buckets.taxableBasis += excessRmd + surplus;

    const portfolioDraw = Math.max(rmd - excessRmd, 0) + tradExtra + taxableWithdraw + rothWithdraw;

    // Cash reserve (same semantics as the simple engine / workbook): a slice of
    // the taxable account sized at N years of draw earns the cash yield instead
    // of the portfolio return. Basis is untouched — the delta is unrealized
    // growth that never accrued.
    const cashReserve =
      inputs.cashReserveOn && phase === 'Retirement' ? Math.min(inputs.cashReserveYears * portfolioDraw, buckets.taxable) : 0;
    buckets.taxable += cashReserve * (inputs.cashReserveYield - rateOfReturn);

    // Clamp tiny negatives from float noise
    buckets.taxable = Math.max(buckets.taxable, 0);
    buckets.taxableBasis = Math.min(Math.max(buckets.taxableBasis, 0), buckets.taxable);
    buckets.tradYou = Math.max(buckets.tradYou, 0);
    buckets.tradSpouse = Math.max(buckets.tradSpouse, 0);
    buckets.roth = Math.max(buckets.roth, 0);

    const endBalance = shortfall ? 0 : buckets.taxable + buckets.tradYou + buckets.tradSpouse + buckets.roth;
    if (shortfall) {
      buckets.taxable = buckets.tradYou = buckets.tradSpouse = buckets.roth = 0;
      buckets.taxableBasis = 0;
    }

    magiHistory.push(taxRes.magi);
    lifetimeTax += taxRes.total;
    lifetimeAcaSubsidy += subsidy;

    const detail: YearDetail = {
      taxableBalance: buckets.taxable,
      traditionalBalance: buckets.tradYou + buckets.tradSpouse,
      rothBalance: buckets.roth,
      rmd,
      rothConversion: conversion,
      magi: taxRes.magi,
      federalTax: taxRes.federal,
      stateTax: taxRes.state,
      taxableSS: taxRes.taxableSS,
      acaSubsidy: subsidy,
      irmaaSurcharge: irmaaAnnual,
      irmaaTier: irmaa.tier,
    };

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
      spending,
      medicare: medicareBase + irmaaAnnual,
      preMedicareInsurance: netPremium,
      ltcCost,
      portfolioDraw,
      estimatedTaxes: taxRes.total,
      rateOfReturn,
      beginBalance,
      endBalance,
      onTrack: !shortfall && endBalance > 0,
      spendingPhase,
      cashReserve,
      endBalanceReal: endBalance / inflFactor,
      detail,
    };
    rows.push(row);
    prev = row;
  }

  const retRow = rows.find((r) => r.year === retYearYou);
  const runOutRow = rows.find((r) => r.endBalance === 0);
  let peak = rows[0];
  for (const r of rows) if (r.endBalance > peak.endBalance) peak = r;
  const last = rows[rows.length - 1];
  const afterTaxEstate =
    (last.detail?.taxableBalance ?? 0) + (last.detail?.rothBalance ?? 0) + (last.detail?.traditionalBalance ?? 0) * (1 - d.heirTaxRate);

  return {
    rows,
    balanceAtRetirement: retRow ? retRow.beginBalance : null,
    finalBalance: last.endBalance,
    runsOut: !!runOutRow,
    runOutYear: runOutRow ? runOutRow.year : null,
    peakBalanceYear: peak.year,
    totalLifetimeSS: rows.reduce((s, r) => s + r.totalSS, 0),
    retirementYearYou: retYearYou,
    retirementYearSpouse: retYearSpouse,
    endYear,
    lifetimeTax,
    lifetimeAcaSubsidy,
    afterTaxEstate,
  };
}

// Dispatcher: every page should call this instead of a specific engine
export function runPlan(inputs: PlanInputs, returnOverrides?: number[]): ProjectionResult {
  if (inputs.taxMode === 'detailed') return runDetailedProjection(inputs, returnOverrides);
  return runProjection(inputs, returnOverrides);
}
