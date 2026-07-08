import type { PlanInputs } from '../model/types';
import type { Budget } from '../model/budget';
import { defaultInputs } from '../model/defaults';
import { defaultBudget } from '../model/budget';

export interface Scenario {
  id: string;
  name: string;
  inputs: PlanInputs;
  createdAt: string;
}

export interface AppState {
  inputs: PlanInputs;
  budget: Budget;
  scenarios: Scenario[];
}

const KEY = 'retirement-planner-v1';
const EXPORT_KEY = 'retirement-planner-last-export';

export function lastExportAt(): string | null {
  try {
    return localStorage.getItem(EXPORT_KEY);
  } catch {
    return null;
  }
}

// Merge saved inputs over defaults so new fields added in later versions get
// sane values, including the nested detailed-tax settings
export function mergeInputs(saved: Partial<PlanInputs> | undefined, fallback: PlanInputs): PlanInputs {
  const d = fallback.detailed;
  const sd = saved?.detailed;
  return {
    ...fallback,
    ...saved,
    you: { ...fallback.you, ...saved?.you },
    spouse: { ...fallback.spouse, ...saved?.spouse },
    detailed: {
      ...d,
      ...sd,
      accounts: { ...d.accounts, ...sd?.accounts },
      contributionSplit: { ...d.contributionSplit, ...sd?.contributionSplit },
      rothConversion: { ...d.rothConversion, ...sd?.rothConversion },
      aca: { ...d.aca, ...sd?.aca },
    },
  };
}

export function loadState(): AppState {
  const fallback: AppState = { inputs: defaultInputs(), budget: defaultBudget(), scenarios: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      inputs: mergeInputs(parsed.inputs, fallback.inputs),
      budget: parsed.budget ?? fallback.budget,
      scenarios: (parsed.scenarios ?? []).map((s) => ({ ...s, inputs: mergeInputs(s.inputs, defaultInputs()) })),
    };
  } catch {
    return fallback;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable — nothing sensible to do
  }
}

export function exportState(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `retirement-plan-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  try {
    localStorage.setItem(EXPORT_KEY, new Date().toISOString());
  } catch {
    // storage full or unavailable — the nudge just won't update
  }
}

export function importState(file: File): Promise<AppState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<AppState>;
        if (!parsed.inputs) throw new Error('Not a retirement-planner export file');
        resolve({
          inputs: mergeInputs(parsed.inputs, defaultInputs()),
          budget: parsed.budget ?? defaultBudget(),
          scenarios: (parsed.scenarios ?? []).map((s) => ({ ...s, inputs: mergeInputs(s.inputs, defaultInputs()) })),
        });
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
