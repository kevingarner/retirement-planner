export interface PersonInputs {
  name: string;
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  annualContribution: number;
  contributionIncreasePct: number; // e.g. 0.01
  medicareEligibilityAge: number;
  partBMonthly: number; // today's $
  partDMonthly: number; // today's $
  irmaaSurchargePct: number; // e.g. 0.4 — multiplies Part B base
  partDIrmaaMonthly: number; // $/mo surcharge
  ssStartAge: number;
  ssAnnualBenefit: number; // today's $
}

export type TaxMode = 'simple' | 'detailed';
export type WithdrawalOrder = 'taxable-trad-roth' | 'trad-taxable-roth';
export type WithdrawalStrategy = 'fixed' | 'guardrails';

export interface PlanEvent {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  amount: number; // today's $ per year
  startYear: number;
  endYear: number; // inclusive; equal to startYear for one-time
  inflationAdjust: boolean;
  taxable: boolean; // income only — counts as ordinary income in detailed mode
}

export interface GuardrailSettings {
  band: number; // trigger when withdrawal rate drifts this far from initial (e.g. 0.2)
  adjustment: number; // spending change applied on a trigger (e.g. 0.1)
}

export interface AccountBuckets {
  taxable: number;
  taxableBasisPct: number; // fraction of today's taxable balance that is cost basis
  traditionalYou: number;
  traditionalSpouse: number;
  roth: number;
}

export interface RothConversionPlan {
  mode: 'none' | 'fixed' | 'fillBracket' | 'fillIrmaa' | 'fillAca';
  amount: number; // annual, for 'fixed' (today's $ — inflated each year)
  bracketTop: number; // marginal rate whose bracket to fill, e.g. 0.24
  startYear: number; // 0 = auto (first retirement year)
  endYear: number; // 0 = auto (year before first RMD)
}

export interface AcaSettings {
  enabled: boolean;
  rules: 'cliff' | 'enhanced'; // pre-ARPA 400%-FPL cliff vs enhanced 8.5% cap
}

export interface DetailedTaxSettings {
  accounts: AccountBuckets;
  taxableYieldPct: number; // dividends/interest thrown off by taxable, taxed annually
  withdrawalOrder: WithdrawalOrder;
  contributionSplit: { traditional: number; roth: number; taxable: number }; // fractions, sum 1
  stateTaxRate: number; // flat, on AGI net of standard deduction
  rmdStartAgeYou: number;
  rmdStartAgeSpouse: number;
  heirTaxRate: number; // heirs' rate on inherited traditional $, for the estate metric
  rothConversion: RothConversionPlan;
  aca: AcaSettings;
}

export interface PlanInputs {
  startYear: number; // calendar year of row 0 (Excel: YEAR(TODAY()))
  taxMode: TaxMode;
  detailed: DetailedTaxSettings;
  events: PlanEvent[];
  withdrawalStrategy: WithdrawalStrategy;
  guardrails: GuardrailSettings;
  you: PersonInputs;
  spouse: PersonInputs;

  // Portfolio
  currentBalance: number;
  returnAccumulation: number;
  returnRetirement: number;
  inflation: number;

  // Spending phases (today's $ / reductions vs Go-Go)
  goGoSpending: number;
  goGoEndAge: number; // your age, last year of full spending
  slowGoReductionPct: number; // negative, e.g. -0.3
  slowGoEndAge: number;
  noGoAdditionalReductionPct: number; // negative, additive with slowGo

  // Pre-Medicare health insurance
  preMedicarePremium: number; // family, today's $
  premiumPctAfterFirstMedicare: number; // share that continues once one spouse is on Medicare

  medicarePremiumGrowth: number; // annual, applies to Medicare costs

  // Taxes (effective rates applied as gross-up on portfolio draws)
  taxRatePreSS: number;
  taxRatePostSS: number;

  // Social Security
  includeSS: boolean;
  ssColaOn: boolean;
  ssColaRate: number;
  ssCutPct: number; // benefit reduction at cut year
  ssCutStartYear: number;

  inflationAdjustWithdrawals: boolean;

  // One-time expense
  oneTimeExpense: number; // today's $
  oneTimeExpenseYear: number;

  // Down-market stress test (first 4 retirement years)
  stressTestOn: boolean;
  stressReturns: [number, number, number, number];

  // Long-term care event (keyed to your age)
  ltcOn: boolean;
  ltcAnnualCost: number; // today's $
  ltcStartAge: number;
  ltcYears: number;

  // Cash reserve bucket
  cashReserveOn: boolean;
  cashReserveYears: number; // years of spending held in cash
  cashReserveYield: number;

  // Survivor scenario (you predecease)
  survivorOn: boolean;
  yourDeathAge: number;
  survivorSpendingChangePct: number; // negative
  survivorTaxRate: number;
}

export type Phase = 'Accumulation' | 'Retirement';
export type SpendingPhase = 'Go-Go' | 'Slow-Go' | 'No-Go' | '';

// Extra per-year outputs only the detailed (tax-aware) engine produces
export interface YearDetail {
  taxableBalance: number;
  traditionalBalance: number; // both spouses
  rothBalance: number;
  rmd: number;
  rothConversion: number;
  magi: number;
  federalTax: number;
  stateTax: number;
  taxableSS: number;
  acaSubsidy: number;
  irmaaSurcharge: number; // annual $, household
  irmaaTier: number;
}

export interface YearRow {
  year: number;
  yourAge: number;
  spouseAge: number;
  phase: Phase;
  yourContribution: number;
  spouseContribution: number;
  yourSS: number;
  spouseSS: number;
  totalSS: number;
  spending: number; // inflated living expenses incl. one-time
  medicare: number;
  preMedicareInsurance: number;
  ltcCost: number;
  portfolioDraw: number; // gross withdrawal incl. tax gross-up
  estimatedTaxes: number;
  rateOfReturn: number;
  beginBalance: number;
  endBalance: number;
  onTrack: boolean;
  spendingPhase: SpendingPhase;
  cashReserve: number;
  endBalanceReal: number; // today's $
  detail?: YearDetail;
}

export interface ProjectionResult {
  rows: YearRow[];
  balanceAtRetirement: number | null; // begin balance in your retirement year
  finalBalance: number;
  runsOut: boolean;
  runOutYear: number | null;
  peakBalanceYear: number;
  totalLifetimeSS: number;
  retirementYearYou: number;
  retirementYearSpouse: number;
  endYear: number;
  // Detailed mode only
  lifetimeTax?: number; // nominal sum of federal + state
  lifetimeAcaSubsidy?: number;
  afterTaxEstate?: number; // final taxable + Roth + traditional×(1−heirTaxRate), nominal
}
