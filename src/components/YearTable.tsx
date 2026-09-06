import type { ProjectionResult } from '../model/types';
import { money } from '../format';

export function YearTable({ result }: { result: ProjectionResult }) {
  const detailed = result.rows.some((r) => r.detail);
  const hasGuardrails = result.rows.some((r) => r.guardrailAction);
  return (
    <div className="table-scroll">
      {hasGuardrails && (
        <p className="card-note">
          <span className="guardrail-badge cut">▼</span> guardrail cut spending that year ·{' '}
          <span className="guardrail-badge raise">▲</span> guardrail raised it back
        </p>
      )}
      <table className="year-table">
        <thead>
          <tr>
            <th>Year</th>
            <th>Ages</th>
            <th>Phase</th>
            <th>Contrib.</th>
            <th>Soc. Sec.</th>
            <th>Spending</th>
            <th title="Medicare Part B/D plus pre-Medicare insurance premiums, combined">Healthcare</th>
            <th>LTC</th>
            {detailed && (
              <>
                <th title="Required minimum distribution taken from traditional accounts this year, per the Uniform Lifetime Table">
                  RMD
                </th>
                <th title="Amount converted from traditional to Roth this year, per your conversion strategy">Conversion</th>
                <th title="Modified adjusted gross income — drives ACA subsidy eligibility and IRMAA tier (IRMAA uses a 2-year lookback)">
                  MAGI
                </th>
                <th title="ACA premium subsidy received this year, based on MAGI, before Medicare eligibility">ACA subsidy</th>
              </>
            )}
            <th title="Federal + state tax for the year in detailed mode; a flat effective-rate gross-up on withdrawals in simple mode">
              Taxes
            </th>
            <th title="Gross withdrawal from the portfolio this year, including the tax gross-up needed to cover Taxes — not the same as Spending">
              Draw
            </th>
            <th title="This year's assumed or simulated rate of return, applied to the beginning balance">Return</th>
            <th title="Nominal portfolio balance at the end of this year">End balance</th>
            <th title="That same end balance, deflated to today's purchasing power">Today's $</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r) => (
            <tr key={r.year} className={r.onTrack ? '' : 'shortfall'}>
              <td>{r.year}</td>
              <td>
                {r.yourAge}/{r.spouseAge}
              </td>
              <td>{r.phase === 'Accumulation' ? 'Working' : r.spendingPhase}</td>
              <td>{money(r.yourContribution + r.spouseContribution)}</td>
              <td>{money(r.totalSS)}</td>
              <td>
                {money(r.spending)}
                {r.guardrailAction === 'cut' && (
                  <span className="guardrail-badge cut" title="Guardrail cut spending this year">
                    ▼
                  </span>
                )}
                {r.guardrailAction === 'raise' && (
                  <span className="guardrail-badge raise" title="Guardrail raised spending this year">
                    ▲
                  </span>
                )}
              </td>
              <td>{money(r.medicare + r.preMedicareInsurance)}</td>
              <td>{money(r.ltcCost)}</td>
              {detailed && (
                <>
                  <td>{money(r.detail?.rmd ?? 0)}</td>
                  <td>{money(r.detail?.rothConversion ?? 0)}</td>
                  <td>{money(r.detail?.magi ?? 0)}</td>
                  <td>{money(r.detail?.acaSubsidy ?? 0)}</td>
                </>
              )}
              <td>{money(r.estimatedTaxes)}</td>
              <td>{money(r.portfolioDraw)}</td>
              <td>{(r.rateOfReturn * 100).toFixed(1)}%</td>
              <td>{money(r.endBalance)}</td>
              <td>{money(r.endBalanceReal)}</td>
              <td>{r.onTrack ? '✓ On track' : '⚠ Shortfall'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
