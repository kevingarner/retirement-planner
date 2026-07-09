import type { PlanInputs } from './types';

export function defaultInputs(): PlanInputs {
  const year = new Date().getFullYear();
  return {
    startYear: year,
    single: false,
    taxMode: 'simple',
    events: [],
    withdrawalStrategy: 'fixed',
    guardrails: { band: 0.2, adjustment: 0.1 },
    detailed: {
      accounts: {
        taxable: 300000,
        taxableBasisPct: 0.7,
        traditionalYou: 250000,
        traditionalSpouse: 250000,
        roth: 200000,
      },
      taxableYieldPct: 0.02,
      withdrawalOrder: 'taxable-trad-roth',
      contributionSplit: { traditional: 0.8, roth: 0.2, taxable: 0 },
      stateTaxRate: 0,
      rmdStartAgeYou: 75,
      rmdStartAgeSpouse: 75,
      heirTaxRate: 0.25,
      rothConversion: { mode: 'none', amount: 50000, bracketTop: 0.12, startYear: 0, endYear: 0 },
      aca: { enabled: true, rules: 'cliff' },
    },
    you: {
      name: 'You',
      currentAge: 50,
      retirementAge: 65,
      lifeExpectancy: 95,
      annualContribution: 30000,
      contributionIncreasePct: 0.02,
      medicareEligibilityAge: 65,
      partBMonthly: 202.9,
      partDMonthly: 34.5,
      irmaaSurchargePct: 0,
      partDIrmaaMonthly: 0,
      ssStartAge: 67,
      ssAnnualBenefit: 30000,
    },
    spouse: {
      name: 'Spouse',
      currentAge: 50,
      retirementAge: 65,
      lifeExpectancy: 95,
      annualContribution: 30000,
      contributionIncreasePct: 0.02,
      medicareEligibilityAge: 65,
      partBMonthly: 202.9,
      partDMonthly: 34.5,
      irmaaSurchargePct: 0,
      partDIrmaaMonthly: 0,
      ssStartAge: 67,
      ssAnnualBenefit: 24000,
    },

    currentBalance: 1000000,
    returnAccumulation: 0.07,
    returnRetirement: 0.05,
    inflation: 0.03,

    goGoSpending: 100000,
    goGoEndAge: 75,
    slowGoReductionPct: -0.1,
    slowGoEndAge: 85,
    noGoAdditionalReductionPct: -0.1,

    preMedicarePremium: 24000,
    premiumPctAfterFirstMedicare: 0.5,

    medicarePremiumGrowth: 0.055,

    taxRatePreSS: 0.15,
    taxRatePostSS: 0.18,

    includeSS: true,
    ssColaOn: false,
    ssColaRate: 0.02,
    ssCutPct: 0.22,
    ssCutStartYear: 2033,

    inflationAdjustWithdrawals: true,

    oneTimeExpense: 0,
    oneTimeExpenseYear: year + 5,

    stressTestOn: false,
    stressReturns: [-0.15, -0.05, 0, 0.08],

    ltcOn: false,
    ltcAnnualCost: 120000,
    ltcStartAge: 85,
    ltcYears: 3,

    cashReserveOn: false,
    cashReserveYears: 2,
    cashReserveYield: 0.03,

    survivorOn: false,
    yourDeathAge: 85,
    survivorSpendingChangePct: -0.25,
    survivorTaxRate: 0.22,
  };
}
