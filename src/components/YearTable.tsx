import type { ProjectionResult } from '../model/types';
import { money } from '../format';

export function YearTable({ result }: { result: ProjectionResult }) {
  const detailed = result.rows.some((r) => r.detail);
  return (
    <div className="table-scroll">
      <table className="year-table">
        <thead>
          <tr>
            <th>Year</th>
            <th>Ages</th>
            <th>Phase</th>
            <th>Contrib.</th>
            <th>Soc. Sec.</th>
            <th>Spending</th>
            <th>Healthcare</th>
            <th>LTC</th>
            {detailed && (
              <>
                <th>RMD</th>
                <th>Conversion</th>
                <th>MAGI</th>
                <th>ACA subsidy</th>
              </>
            )}
            <th>Taxes</th>
            <th>Draw</th>
            <th>Return</th>
            <th>End balance</th>
            <th>Today's $</th>
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
              <td>{money(r.spending)}</td>
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
