export interface BudgetItem {
  id: string;
  name: string;
  monthly: number;
  note?: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  items: BudgetItem[];
  isHealthcare?: boolean; // excluded from the push-to-plan spending number
}

export interface Budget {
  categories: BudgetCategory[];
}

let nextId = 1;
const uid = () => `b${Date.now().toString(36)}${(nextId++).toString(36)}`;

const item = (name: string, monthly = 0, note?: string): BudgetItem => ({ id: uid(), name, monthly, note });

export function defaultBudget(): Budget {
  return {
    categories: [
      {
        id: uid(),
        name: 'Housing',
        items: [
          item('Mortgage / Rent'),
          item('Property Taxes'),
          item('Home Insurance'),
          item('HOA / Condo Fees'),
          item('Utilities (electric, gas, water)'),
          item('Internet / Phone / Cable'),
          item('Maintenance / Repairs'),
        ],
      },
      {
        id: uid(),
        name: 'Transportation',
        items: [item('Car Payment(s)'), item('Auto Insurance'), item('Gas / Fuel'), item('Registration / Maintenance')],
      },
      {
        id: uid(),
        name: 'Food',
        items: [item('Groceries'), item('Dining Out / Takeout'), item('Coffee / Snacks')],
      },
      {
        id: uid(),
        name: 'Healthcare',
        isHealthcare: true,
        items: [
          item('Health Insurance Premiums', 0, 'Modeled separately in the projection'),
          item('Dental / Vision'),
          item('Prescriptions / Out-of-Pocket'),
          item('Medicare Part B (per person)', 0, 'Starts at Medicare age; modeled separately'),
          item('Medicare Part D (per person)', 0, 'Per person — modeled separately'),
        ],
      },
      {
        id: uid(),
        name: 'Personal & Family',
        items: [item('Clothing'), item('Personal Care'), item('Child / Family Support'), item('Pet Care')],
      },
      {
        id: uid(),
        name: 'Lifestyle & Fun',
        items: [
          item('Travel / Vacations'),
          item('Entertainment / Hobbies'),
          item('Subscriptions (streaming, gym, etc.)'),
          item('Gifts / Charitable Giving'),
        ],
      },
      {
        id: uid(),
        name: 'Other / Misc',
        items: [item('Life Insurance'), item('Taxes (if not withheld)'), item('Miscellaneous / Buffer')],
      },
    ],
  };
}

export function categoryMonthly(cat: BudgetCategory): number {
  return cat.items.reduce((s, i) => s + (i.monthly || 0), 0);
}

export function totalMonthly(budget: Budget): number {
  return budget.categories.reduce((s, c) => s + categoryMonthly(c), 0);
}

// Annual non-savings spending excluding health insurance premiums — the number
// to push into the plan's Go-Go spending input (the projection models health
// premiums, Medicare, and taxes separately, like Budget!C61 in the workbook).
export function annualSpendingForPlan(budget: Budget): number {
  return budget.categories.reduce((s, c) => s + (c.isHealthcare ? 0 : categoryMonthly(c) * 12), 0);
}

// Healthcare-only annual total, shown for reference
export function annualHealthcare(budget: Budget): number {
  return budget.categories.reduce((s, c) => s + (c.isHealthcare ? categoryMonthly(c) * 12 : 0), 0);
}

export function newItem(name = 'New item'): BudgetItem {
  return item(name);
}
