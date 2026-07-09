import type { PlanInputs, PersonInputs, DetailedTaxSettings } from '../model/types';
import { annualMedicareCost } from '../model/projection';
import { money } from '../format';
import { Section, Field, MoneyInput, IntInput, PercentInput, Toggle, Select } from './ui';

interface Props {
  inputs: PlanInputs;
  onChange: (inputs: PlanInputs) => void;
}

export function InputsPanel({ inputs, onChange }: Props) {
  const set = (patch: Partial<PlanInputs>) => onChange({ ...inputs, ...patch });
  const setYou = (patch: Partial<PersonInputs>) => set({ you: { ...inputs.you, ...patch } });
  const setSpouse = (patch: Partial<PersonInputs>) => set({ spouse: { ...inputs.spouse, ...patch } });
  const setDetailed = (patch: Partial<DetailedTaxSettings>) => set({ detailed: { ...inputs.detailed, ...patch } });
  const det = inputs.detailed;
  const isDetailed = inputs.taxMode === 'detailed';
  const bucketTotal =
    det.accounts.taxable +
    det.accounts.traditionalYou +
    (inputs.single ? 0 : det.accounts.traditionalSpouse) +
    det.accounts.roth;

  // In single mode the paired rows collapse to one column (just "you")
  const pair = (
    label: string,
    render: (p: PersonInputs, setP: (patch: Partial<PersonInputs>) => void) => React.ReactNode,
    hint?: string,
  ) => (
    <Field label={label} hint={hint}>
      <span className="pair">
        {render(inputs.you, setYou)}
        {!inputs.single && render(inputs.spouse, setSpouse)}
      </span>
    </Field>
  );

  // Column labels repeated in each section with per-person paired inputs
  const pairLabels = inputs.single ? null : (
    <div className="pair-heading">
      <span />
      <span className="pair">
        <span className="pair-col">{inputs.you.name || 'You'}</span>
        <span className="pair-col">{inputs.spouse.name || 'Spouse'}</span>
      </span>
    </div>
  );

  return (
    <div className="inputs-panel">
      <Section title="People">
        <Field label="Planning for" hint="Just me: spouse inputs are hidden and ignored; detailed mode uses single filing status">
          <Select
            value={inputs.single ? 'single' : 'couple'}
            options={[
              { value: 'couple', label: 'A couple' },
              { value: 'single', label: 'Just me' },
            ]}
            onChange={(v) => set({ single: v === 'single' })}
          />
        </Field>
        <div className="pair-heading">
          <span />
          <span className="pair">
            <input className="num name" value={inputs.you.name} onChange={(e) => setYou({ name: e.target.value })} />
            {!inputs.single && (
              <input className="num name" value={inputs.spouse.name} onChange={(e) => setSpouse({ name: e.target.value })} />
            )}
          </span>
        </div>
        {pair('Current age', (p, s) => <IntInput value={p.currentAge} onChange={(v) => s({ currentAge: v })} />)}
        {pair('Retirement age', (p, s) => <IntInput value={p.retirementAge} onChange={(v) => s({ retirementAge: v })} />)}
        {pair('Life expectancy', (p, s) => <IntInput value={p.lifeExpectancy} onChange={(v) => s({ lifeExpectancy: v })} />)}
      </Section>

      <Section title="Portfolio & returns">
        {isDetailed ? (
          <div className="derived">Portfolio balance: {money(bucketTotal)} (sum of the account buckets below)</div>
        ) : (
          <Field label="Current portfolio balance">
            <MoneyInput value={inputs.currentBalance} onChange={(v) => set({ currentBalance: v })} />
          </Field>
        )}
        <Field label="Return while working" hint="Annual rate of return during accumulation">
          <PercentInput value={inputs.returnAccumulation} onChange={(v) => set({ returnAccumulation: v })} />
        </Field>
        <Field label="Return in retirement">
          <PercentInput value={inputs.returnRetirement} onChange={(v) => set({ returnRetirement: v })} />
        </Field>
        <Field label="Inflation">
          <PercentInput value={inputs.inflation} onChange={(v) => set({ inflation: v })} />
        </Field>
      </Section>

      <Section title="Contributions (annual)">
        {pairLabels}
        {pair('Annual contribution', (p, s) => (
          <MoneyInput value={p.annualContribution} onChange={(v) => s({ annualContribution: v })} />
        ))}
        {pair('Increase per year', (p, s) => (
          <PercentInput value={p.contributionIncreasePct} onChange={(v) => s({ contributionIncreasePct: v })} />
        ))}
      </Section>

      <Section title="Retirement spending phases">
        <Field label="Go-Go annual spending (today's $)" hint="Base spending in early retirement">
          <MoneyInput value={inputs.goGoSpending} onChange={(v) => set({ goGoSpending: v })} />
        </Field>
        <Field label="Go-Go through age" hint="Your age — last year of full spending">
          <IntInput value={inputs.goGoEndAge} onChange={(v) => set({ goGoEndAge: v })} />
        </Field>
        <Field label="Slow-Go reduction" hint="Spending change vs Go-Go (negative)">
          <PercentInput value={inputs.slowGoReductionPct} onChange={(v) => set({ slowGoReductionPct: v })} />
        </Field>
        <Field label="Slow-Go through age">
          <IntInput value={inputs.slowGoEndAge} onChange={(v) => set({ slowGoEndAge: v })} />
        </Field>
        <Field label="No-Go additional reduction" hint="Added to the Slow-Go reduction">
          <PercentInput value={inputs.noGoAdditionalReductionPct} onChange={(v) => set({ noGoAdditionalReductionPct: v })} />
        </Field>
        <Field label="Inflation-adjust withdrawals?">
          <Toggle value={inputs.inflationAdjustWithdrawals} onChange={(v) => set({ inflationAdjustWithdrawals: v })} />
        </Field>
        <Field label="Withdrawal strategy" hint="Guardrails: cut spending 10% when the withdrawal rate drifts 20% above its starting level, raise it after strong markets">
          <Select
            value={inputs.withdrawalStrategy}
            options={[
              { value: 'fixed', label: 'Fixed (inflation-adjusted)' },
              { value: 'guardrails', label: 'Guardrails (flexible)' },
            ]}
            onChange={(v) => set({ withdrawalStrategy: v })}
          />
        </Field>
        {inputs.withdrawalStrategy === 'guardrails' && (
          <>
            <Field label="Guardrail band" hint="How far the withdrawal rate may drift from its initial level before triggering">
              <PercentInput value={inputs.guardrails.band} onChange={(v) => set({ guardrails: { ...inputs.guardrails, band: v } })} />
            </Field>
            <Field label="Spending adjustment" hint="Size of each cut or raise when a guardrail triggers">
              <PercentInput value={inputs.guardrails.adjustment} onChange={(v) => set({ guardrails: { ...inputs.guardrails, adjustment: v } })} />
            </Field>
          </>
        )}
        <Field label="One-time expense (today's $)">
          <MoneyInput value={inputs.oneTimeExpense} onChange={(v) => set({ oneTimeExpense: v })} />
        </Field>
        <Field label="One-time expense year">
          <IntInput value={inputs.oneTimeExpenseYear} onChange={(v) => set({ oneTimeExpenseYear: v })} />
        </Field>
      </Section>

      <Section title="Income & expense events" defaultOpen={false}>
        <div className="derived">
          Pensions, rental income, inheritance, part-time work, weddings, home downsizing… Income offsets withdrawals
          (surplus is reinvested); expenses add to them. "Taxable" income counts as ordinary income in the detailed
          tax model.
        </div>
        {inputs.events.map((e) => (
          <div className="event-row" key={e.id}>
            <div className="event-line">
              <input
                className="num name"
                value={e.name}
                onChange={(ev) => set({ events: inputs.events.map((x) => (x.id === e.id ? { ...x, name: ev.target.value } : x)) })}
              />
              <Select
                value={e.kind}
                options={[
                  { value: 'income', label: 'Income' },
                  { value: 'expense', label: 'Expense' },
                ]}
                onChange={(v) => set({ events: inputs.events.map((x) => (x.id === e.id ? { ...x, kind: v } : x)) })}
              />
              <button
                className="link-btn danger"
                title="Remove event"
                onClick={() => set({ events: inputs.events.filter((x) => x.id !== e.id) })}
              >
                ×
              </button>
            </div>
            <div className="event-line">
              <Field label="$/yr (today's $)">
                <MoneyInput value={e.amount} onChange={(v) => set({ events: inputs.events.map((x) => (x.id === e.id ? { ...x, amount: v } : x)) })} />
              </Field>
            </div>
            <div className="event-line">
              <Field label="From year / to year">
                <span className="pair">
                  <IntInput value={e.startYear} onChange={(v) => set({ events: inputs.events.map((x) => (x.id === e.id ? { ...x, startYear: v } : x)) })} />
                  <IntInput value={e.endYear} onChange={(v) => set({ events: inputs.events.map((x) => (x.id === e.id ? { ...x, endYear: v } : x)) })} />
                </span>
              </Field>
            </div>
            <div className="event-line">
              <Field label="Inflation-adjust?">
                <Toggle value={e.inflationAdjust} onChange={(v) => set({ events: inputs.events.map((x) => (x.id === e.id ? { ...x, inflationAdjust: v } : x)) })} />
              </Field>
            </div>
            {e.kind === 'income' && (
              <div className="event-line">
                <Field label="Taxable income?">
                  <Toggle value={e.taxable} onChange={(v) => set({ events: inputs.events.map((x) => (x.id === e.id ? { ...x, taxable: v } : x)) })} />
                </Field>
              </div>
            )}
          </div>
        ))}
        <button
          className="link-btn"
          onClick={() =>
            set({
              events: [
                ...inputs.events,
                {
                  id: `ev${Date.now().toString(36)}`,
                  name: 'New event',
                  kind: 'expense',
                  amount: 10000,
                  startYear: inputs.startYear + 5,
                  endYear: inputs.startYear + 5,
                  inflationAdjust: true,
                  taxable: false,
                },
              ],
            })
          }
        >
          + Add event
        </button>
      </Section>

      <Section title="Health insurance & Medicare" defaultOpen={false}>
        <Field
          label={inputs.single ? 'Pre-Medicare premium (today’s $)' : 'Pre-Medicare premium (family, today’s $)'}
          hint="Annual premium from retirement until Medicare"
        >
          <MoneyInput value={inputs.preMedicarePremium} onChange={(v) => set({ preMedicarePremium: v })} />
        </Field>
        {!inputs.single && (
          <Field label="Premium share once one is on Medicare">
            <PercentInput value={inputs.premiumPctAfterFirstMedicare} onChange={(v) => set({ premiumPctAfterFirstMedicare: v })} />
          </Field>
        )}
        {isDetailed && (
          <>
            <Field label="Model ACA premium subsidies?" hint="Subsidy on the pre-Medicare premium based on each year's MAGI">
              <Toggle value={det.aca.enabled} onChange={(v) => setDetailed({ aca: { ...det.aca, enabled: v } })} />
            </Field>
            <Field label="Subsidy rules" hint="Cliff: no subsidy above 400% of the poverty level (post-2025 law). Enhanced: 8.5% cap, no cliff (if Congress restores it).">
              <Select
                value={det.aca.rules}
                options={[
                  { value: 'cliff', label: '400% FPL cliff' },
                  { value: 'enhanced', label: 'Enhanced (8.5% cap)' },
                ]}
                onChange={(v) => setDetailed({ aca: { ...det.aca, rules: v } })}
              />
            </Field>
          </>
        )}
        {pairLabels}
        {pair('Medicare eligibility age', (p, s) => (
          <IntInput value={p.medicareEligibilityAge} onChange={(v) => s({ medicareEligibilityAge: v })} />
        ))}
        {pair('Part B monthly premium', (p, s) => <MoneyInput value={p.partBMonthly} onChange={(v) => s({ partBMonthly: v })} />)}
        {pair('Part D monthly premium', (p, s) => <MoneyInput value={p.partDMonthly} onChange={(v) => s({ partDMonthly: v })} />)}
        {isDetailed ? (
          <div className="derived">IRMAA surcharges are computed from each year's MAGI (2-year lookback) — no manual entry needed.</div>
        ) : (
          <>
            {pair('IRMAA surcharge (% of Part B)', (p, s) => (
              <PercentInput value={p.irmaaSurchargePct} onChange={(v) => s({ irmaaSurchargePct: v })} />
            ), 'Income-related surcharge — see ssa.gov for your MAGI tier')}
            {pair('Part D IRMAA ($/mo)', (p, s) => (
              <MoneyInput value={p.partDIrmaaMonthly} onChange={(v) => s({ partDIrmaaMonthly: v })} />
            ))}
          </>
        )}
        <Field label="Medicare premium growth">
          <PercentInput value={inputs.medicarePremiumGrowth} onChange={(v) => set({ medicarePremiumGrowth: v })} />
        </Field>
        <div className="derived">
          Annual Medicare (today's $): {money(annualMedicareCost(inputs.you))} + {money(annualMedicareCost(inputs.spouse))} ={' '}
          {money(annualMedicareCost(inputs.you) + annualMedicareCost(inputs.spouse))}
        </div>
      </Section>

      <Section title="Taxes">
        <Field label="Tax model" hint="Simple: flat effective rates (matches the Excel workbook). Detailed: account types, real federal brackets, RMDs, Roth conversions, ACA, IRMAA.">
          <Select
            value={inputs.taxMode}
            options={[
              { value: 'simple', label: 'Simple (flat rates)' },
              { value: 'detailed', label: 'Detailed (brackets & accounts)' },
            ]}
            onChange={(v) => set({ taxMode: v })}
          />
        </Field>
        {isDetailed ? (
          <>
            <Field label="State tax rate (flat)" hint="Applied to AGI net of the standard deduction; 0 for no-income-tax states">
              <PercentInput value={det.stateTaxRate} onChange={(v) => setDetailed({ stateTaxRate: v })} />
            </Field>
            <div className="derived">
              Federal tax uses 2026 brackets (MFJ; single after a first death), standard deduction, capital-gains
              stacking, NIIT, and the Social Security provisional-income rules. Thresholds are inflation-indexed.
            </div>
          </>
        ) : (
          <>
            <Field label="Effective rate before Social Security" hint="Applied as a gross-up on portfolio withdrawals">
              <PercentInput value={inputs.taxRatePreSS} onChange={(v) => set({ taxRatePreSS: v })} />
            </Field>
            <Field label="Effective rate after Social Security starts">
              <PercentInput value={inputs.taxRatePostSS} onChange={(v) => set({ taxRatePostSS: v })} />
            </Field>
          </>
        )}
      </Section>

      {isDetailed && (
        <Section title="Accounts & withdrawals">
          <Field label="Taxable (brokerage)">
            <MoneyInput value={det.accounts.taxable} onChange={(v) => setDetailed({ accounts: { ...det.accounts, taxable: v } })} />
          </Field>
          <Field label="Taxable cost basis" hint="Share of today's taxable balance that is cost basis (not gains)">
            <PercentInput value={det.accounts.taxableBasisPct} onChange={(v) => setDetailed({ accounts: { ...det.accounts, taxableBasisPct: v } })} />
          </Field>
          <Field label={`Traditional — ${inputs.you.name}`} hint="401(k)/IRA, pre-tax">
            <MoneyInput value={det.accounts.traditionalYou} onChange={(v) => setDetailed({ accounts: { ...det.accounts, traditionalYou: v } })} />
          </Field>
          {!inputs.single && (
            <Field label={`Traditional — ${inputs.spouse.name}`}>
              <MoneyInput value={det.accounts.traditionalSpouse} onChange={(v) => setDetailed({ accounts: { ...det.accounts, traditionalSpouse: v } })} />
            </Field>
          )}
          <Field label="Roth (combined)">
            <MoneyInput value={det.accounts.roth} onChange={(v) => setDetailed({ accounts: { ...det.accounts, roth: v } })} />
          </Field>
          <Field label="Taxable yield" hint="Dividends/interest thrown off annually; taxed as qualified income">
            <PercentInput value={det.taxableYieldPct} onChange={(v) => setDetailed({ taxableYieldPct: v })} />
          </Field>
          <Field label="Withdrawal order">
            <Select
              value={det.withdrawalOrder}
              options={[
                { value: 'taxable-trad-roth', label: 'Taxable → Trad → Roth' },
                { value: 'trad-taxable-roth', label: 'Trad → Taxable → Roth' },
              ]}
              onChange={(v) => setDetailed({ withdrawalOrder: v })}
            />
          </Field>
          <Field label="Contributions to traditional" hint="Shares of annual contributions by destination; remainder goes to taxable">
            <PercentInput
              value={det.contributionSplit.traditional}
              onChange={(v) =>
                setDetailed({
                  contributionSplit: {
                    traditional: v,
                    roth: det.contributionSplit.roth,
                    taxable: Math.max(1 - v - det.contributionSplit.roth, 0),
                  },
                })
              }
            />
          </Field>
          <Field label="Contributions to Roth">
            <PercentInput
              value={det.contributionSplit.roth}
              onChange={(v) =>
                setDetailed({
                  contributionSplit: {
                    traditional: det.contributionSplit.traditional,
                    roth: v,
                    taxable: Math.max(1 - det.contributionSplit.traditional - v, 0),
                  },
                })
              }
            />
          </Field>
          <Field label={`RMD start age — ${inputs.you.name}`} hint="73 if born 1951–1959, 75 if born 1960 or later">
            <IntInput value={det.rmdStartAgeYou} onChange={(v) => setDetailed({ rmdStartAgeYou: v })} />
          </Field>
          {!inputs.single && (
            <Field label={`RMD start age — ${inputs.spouse.name}`}>
              <IntInput value={det.rmdStartAgeSpouse} onChange={(v) => setDetailed({ rmdStartAgeSpouse: v })} />
            </Field>
          )}
          <Field label="Heirs' tax rate on traditional $" hint="Used only for the after-tax estate metric">
            <PercentInput value={det.heirTaxRate} onChange={(v) => setDetailed({ heirTaxRate: v })} />
          </Field>
        </Section>
      )}

      {isDetailed && (
        <Section title="Roth conversions">
          <Field label="Strategy" hint="Convert traditional → Roth during the window; the Roth Explorer page compares these">
            <Select
              value={det.rothConversion.mode}
              options={[
                { value: 'none', label: 'None' },
                { value: 'fixed', label: "Fixed amount (today's $)" },
                { value: 'fillBracket', label: 'Fill tax bracket' },
                { value: 'fillIrmaa', label: 'Stay under IRMAA' },
                { value: 'fillAca', label: 'Stay under ACA cliff' },
              ]}
              onChange={(v) => setDetailed({ rothConversion: { ...det.rothConversion, mode: v } })}
            />
          </Field>
          {det.rothConversion.mode === 'fixed' && (
            <Field label="Annual amount (today's $)">
              <MoneyInput value={det.rothConversion.amount} onChange={(v) => setDetailed({ rothConversion: { ...det.rothConversion, amount: v } })} />
            </Field>
          )}
          {det.rothConversion.mode === 'fillBracket' && (
            <Field label="Fill up to bracket">
              <Select
                value={String(det.rothConversion.bracketTop)}
                options={[
                  { value: '0.1', label: '10%' },
                  { value: '0.12', label: '12%' },
                  { value: '0.22', label: '22%' },
                  { value: '0.24', label: '24%' },
                ]}
                onChange={(v) => setDetailed({ rothConversion: { ...det.rothConversion, bracketTop: Number(v) } })}
              />
            </Field>
          )}
          <Field label="Start year" hint="0 = automatic (first retirement year)">
            <IntInput value={det.rothConversion.startYear} onChange={(v) => setDetailed({ rothConversion: { ...det.rothConversion, startYear: v } })} />
          </Field>
          <Field label="End year" hint="0 = automatic (year before RMDs begin)">
            <IntInput value={det.rothConversion.endYear} onChange={(v) => setDetailed({ rothConversion: { ...det.rothConversion, endYear: v } })} />
          </Field>
        </Section>
      )}

      <Section title="Social Security" defaultOpen={false}>
        <Field label="Include Social Security?">
          <Toggle value={inputs.includeSS} onChange={(v) => set({ includeSS: v })} />
        </Field>
        {pairLabels}
        {pair('Start age', (p, s) => <IntInput value={p.ssStartAge} onChange={(v) => s({ ssStartAge: v })} />)}
        {pair('Annual benefit (today’s $)', (p, s) => (
          <MoneyInput value={p.ssAnnualBenefit} onChange={(v) => s({ ssAnnualBenefit: v })} />
        ), 'Estimate at ssa.gov/estimator. Already claiming? Enter this year’s actual benefit and your real (past) start age.')}
        <Field label="Apply COLA?">
          <Toggle value={inputs.ssColaOn} onChange={(v) => set({ ssColaOn: v })} />
        </Field>
        <Field label="COLA rate">
          <PercentInput value={inputs.ssColaRate} onChange={(v) => set({ ssColaRate: v })} />
        </Field>
        <Field label="Benefit cut (funding shortfall)" hint="Trustees Report projects ~22% if unaddressed">
          <PercentInput value={inputs.ssCutPct} onChange={(v) => set({ ssCutPct: v })} />
        </Field>
        <Field label="Cut starts in year">
          <IntInput value={inputs.ssCutStartYear} onChange={(v) => set({ ssCutStartYear: v })} />
        </Field>
      </Section>

      <Section title="Stress test: bad early returns" defaultOpen={false}>
        <Field label="Apply down-market stress?" hint="Overrides returns for the first 4 retirement years">
          <Toggle value={inputs.stressTestOn} onChange={(v) => set({ stressTestOn: v })} />
        </Field>
        {inputs.stressReturns.map((r, i) => (
          <Field key={i} label={`Retirement year ${i + 1} return`}>
            <PercentInput
              value={r}
              onChange={(v) => {
                const next = [...inputs.stressReturns] as PlanInputs['stressReturns'];
                next[i] = v;
                set({ stressReturns: next });
              }}
            />
          </Field>
        ))}
      </Section>

      <Section title="Long-term care event" defaultOpen={false}>
        <Field label="Model an LTC event?">
          <Toggle value={inputs.ltcOn} onChange={(v) => set({ ltcOn: v })} />
        </Field>
        <Field label="Annual cost (today's $)">
          <MoneyInput value={inputs.ltcAnnualCost} onChange={(v) => set({ ltcAnnualCost: v })} />
        </Field>
        <Field label={`Start age (${inputs.you.name})`}>
          <IntInput value={inputs.ltcStartAge} onChange={(v) => set({ ltcStartAge: v })} />
        </Field>
        <Field label="Duration (years)">
          <IntInput value={inputs.ltcYears} onChange={(v) => set({ ltcYears: v })} />
        </Field>
      </Section>

      <Section title="Cash reserve bucket" defaultOpen={false}>
        {isDetailed && <div className="derived">Simple tax mode only — ignored while the detailed model is active.</div>}
        <Field label="Use a cash reserve?" hint="Holds N years of withdrawals in cash at its own yield">
          <Toggle value={inputs.cashReserveOn} onChange={(v) => set({ cashReserveOn: v })} />
        </Field>
        <Field label="Reserve size (years of spending)">
          <IntInput value={inputs.cashReserveYears} onChange={(v) => set({ cashReserveYears: v })} />
        </Field>
        <Field label="Cash yield">
          <PercentInput value={inputs.cashReserveYield} onChange={(v) => set({ cashReserveYield: v })} />
        </Field>
      </Section>

      {!inputs.single && (
        <Section title="Survivor scenario" defaultOpen={false}>
          <Field label={`Model first death (${inputs.you.name} predeceases)?`}>
            <Toggle value={inputs.survivorOn} onChange={(v) => set({ survivorOn: v })} />
          </Field>
          <Field label="Age at first death">
            <IntInput value={inputs.yourDeathAge} onChange={(v) => set({ yourDeathAge: v })} />
          </Field>
          <Field label="Spending change after">
            <PercentInput value={inputs.survivorSpendingChangePct} onChange={(v) => set({ survivorSpendingChangePct: v })} />
          </Field>
          <Field label="Survivor effective tax rate">
            <PercentInput value={inputs.survivorTaxRate} onChange={(v) => set({ survivorTaxRate: v })} />
          </Field>
        </Section>
      )}
    </div>
  );
}
