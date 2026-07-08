import type { Budget, BudgetCategory, BudgetItem } from '../model/budget';
import { categoryMonthly, totalMonthly, annualSpendingForPlan, annualHealthcare, newItem } from '../model/budget';
import { money, pct } from '../format';
import { MoneyInput } from '../components/ui';

interface Props {
  budget: Budget;
  goGoSpending: number;
  onChange: (budget: Budget) => void;
  onPushToPlan: (annualSpending: number) => void;
}

export function BudgetPage({ budget, goGoSpending, onChange, onPushToPlan }: Props) {
  const planNumber = annualSpendingForPlan(budget);
  const grandAnnual = totalMonthly(budget) * 12;
  const diff = goGoSpending - planNumber;

  const setCategory = (cat: BudgetCategory) =>
    onChange({ categories: budget.categories.map((c) => (c.id === cat.id ? cat : c)) });
  const setItem = (cat: BudgetCategory, item: BudgetItem) =>
    setCategory({ ...cat, items: cat.items.map((i) => (i.id === item.id ? item : i)) });

  return (
    <div className="dashboard">
      <div className="card budget-summary">
        <h3>Budget → plan reconciliation</h3>
        <p className="card-note">
          The projection models health premiums, Medicare, and taxes separately — so the number that should feed the
          plan's Go-Go spending is your non-savings spending <em>excluding healthcare</em>.
        </p>
        <div className="recon-row">
          <div>
            <div className="stat-label">Non-savings spending (excl. healthcare)</div>
            <div className="stat-value">{money(planNumber)}/yr</div>
          </div>
          <div>
            <div className="stat-label">Plan's Go-Go spending input</div>
            <div className="stat-value">{money(goGoSpending)}/yr</div>
          </div>
          <div>
            <div className="stat-label">Difference</div>
            <div className={`stat-value ${Math.abs(diff) < 1000 ? 'good' : ''}`}>
              {diff >= 0 ? '+' : '−'}
              {money(Math.abs(diff))}
            </div>
          </div>
          <button className="btn" onClick={() => onPushToPlan(planNumber)} disabled={Math.abs(diff) < 1}>
            Use budget number in plan
          </button>
        </div>
        <div className="card-note">
          Healthcare lines total {money(annualHealthcare(budget))}/yr (kept out of the push). Total budget:{' '}
          {money(grandAnnual)}/yr.
        </div>
      </div>

      {budget.categories.map((cat) => {
        const catMonthly = categoryMonthly(cat);
        return (
          <div className="card" key={cat.id}>
            <div className="chart-header">
              <h3>{cat.name}</h3>
              <span className="cat-total">
                {money(catMonthly)}/mo · {money(catMonthly * 12)}/yr
                {grandAnnual > 0 && ` · ${pct((catMonthly * 12) / grandAnnual, 0)}`}
              </span>
            </div>
            <table className="budget-table">
              <tbody>
                {cat.items.map((item) => (
                  <tr key={item.id}>
                    <td className="budget-name">
                      <input
                        className="ghost-input"
                        value={item.name}
                        onChange={(e) => setItem(cat, { ...item, name: e.target.value })}
                      />
                    </td>
                    <td className="budget-monthly">
                      <MoneyInput value={item.monthly} onChange={(v) => setItem(cat, { ...item, monthly: v })} />
                      <span className="per">/mo</span>
                    </td>
                    <td className="budget-annual">{money(item.monthly * 12)}/yr</td>
                    <td className="budget-note">{item.note}</td>
                    <td>
                      <button
                        className="link-btn danger"
                        title="Remove item"
                        onClick={() => setCategory({ ...cat, items: cat.items.filter((i) => i.id !== item.id) })}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="link-btn" onClick={() => setCategory({ ...cat, items: [...cat.items, newItem()] })}>
              + Add item
            </button>
          </div>
        );
      })}
    </div>
  );
}
