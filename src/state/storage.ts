import type { PlanInputs, PlanEvent } from '../model/types';
import type { Budget, BudgetCategory, BudgetItem } from '../model/budget';
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

export const STORAGE_KEY = 'retirement-planner-v1';
const BACKUP_KEY = 'retirement-planner-v1-lastgood';
const EXPORT_KEY = 'retirement-planner-last-export';

export function lastExportAt(): string | null {
  try {
    return localStorage.getItem(EXPORT_KEY);
  } catch {
    return null;
  }
}

type Json = Record<string, unknown>;

function isPlainObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Recursively copies `raw` onto the shape of `fallback`: a value is kept only
// if its type matches the default at that position, otherwise the default
// wins. This is the boundary where untrusted JSON (a hand-edited export, a
// file from an older/newer version, or garbage) becomes safe to feed into the
// projection engines — no wrong-typed value can reach the math.
// Note: array defaults are matched element-by-element by position, which is
// correct for fixed-shape tuples (e.g. stressReturns) but NOT for variable-
// length lists like `events` — those need their own sanitizer (below).
function sanitizeLike<T>(raw: unknown, fallback: T): T {
  if (Array.isArray(fallback)) {
    if (!Array.isArray(raw)) return fallback;
    return fallback.map((fv, i) => sanitizeLike(raw[i], fv)) as unknown as T;
  }
  if (isPlainObject(fallback)) {
    if (!isPlainObject(raw)) return fallback;
    const result: Json = {};
    for (const key of Object.keys(fallback)) {
      result[key] = sanitizeLike(raw[key], (fallback as Json)[key]);
    }
    return result as T;
  }
  if (typeof fallback === 'number') {
    return (typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback) as T;
  }
  if (typeof fallback === 'string') {
    return (typeof raw === 'string' ? raw : fallback) as T;
  }
  if (typeof fallback === 'boolean') {
    return (typeof raw === 'boolean' ? raw : fallback) as T;
  }
  return fallback;
}

function enumOrDefault<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

// Age-like fields need a range check, not just a type check: projectionEndYear
// (src/model/projection.ts) sizes its year-by-year loop off `lifeExpectancy -
// currentAge`, so an imported currentAge of -999 (still a perfectly finite
// number) turns into a ~1,000-year projection computed on every page, every
// Monte Carlo trial, and every backtest cohort — a real perf/DoS footgun, not
// just a display glitch. 130 is a generous human-age ceiling.
const clampAge = (n: number) => Math.min(130, Math.max(0, n));

function sanitizePlanEvent(raw: unknown): PlanEvent | null {
  if (!isPlainObject(raw)) return null;
  const { id, name, kind, amount, startYear, endYear, inflationAdjust, taxable } = raw;
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  if (kind !== 'income' && kind !== 'expense') return null;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  if (typeof startYear !== 'number' || !Number.isFinite(startYear)) return null;
  if (typeof endYear !== 'number' || !Number.isFinite(endYear)) return null;
  if (typeof inflationAdjust !== 'boolean' || typeof taxable !== 'boolean') return null;
  return { id, name, kind, amount, startYear, endYear, inflationAdjust, taxable };
}

function sanitizeEvents(raw: unknown): PlanEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizePlanEvent).filter((e): e is PlanEvent => e !== null);
}

// Type-checks saved/imported inputs against `fallback` field by field, and
// merges in defaults for anything missing, mistyped, or added by a newer
// version — this is what gives the app forward/backward compatibility across
// schema changes while also rejecting corrupt or malicious input.
export function sanitizeInputs(raw: unknown, fallback: PlanInputs): PlanInputs {
  const base = sanitizeLike(raw, fallback);
  const r: Json = isPlainObject(raw) ? raw : {};
  const rd: Json = isPlainObject(r.detailed) ? (r.detailed as Json) : {};
  const rRoth: Json = isPlainObject(rd.rothConversion) ? (rd.rothConversion as Json) : {};
  const rAca: Json = isPlainObject(rd.aca) ? (rd.aca as Json) : {};
  return {
    ...base,
    taxMode: enumOrDefault(r.taxMode, ['simple', 'detailed'], fallback.taxMode),
    withdrawalStrategy: enumOrDefault(r.withdrawalStrategy, ['fixed', 'guardrails'], fallback.withdrawalStrategy),
    events: sanitizeEvents(r.events),
    you: {
      ...base.you,
      currentAge: clampAge(base.you.currentAge),
      retirementAge: clampAge(base.you.retirementAge),
      lifeExpectancy: clampAge(base.you.lifeExpectancy),
      medicareEligibilityAge: clampAge(base.you.medicareEligibilityAge),
      ssStartAge: clampAge(base.you.ssStartAge),
    },
    spouse: {
      ...base.spouse,
      currentAge: clampAge(base.spouse.currentAge),
      retirementAge: clampAge(base.spouse.retirementAge),
      lifeExpectancy: clampAge(base.spouse.lifeExpectancy),
      medicareEligibilityAge: clampAge(base.spouse.medicareEligibilityAge),
      ssStartAge: clampAge(base.spouse.ssStartAge),
    },
    goGoEndAge: clampAge(base.goGoEndAge),
    slowGoEndAge: clampAge(base.slowGoEndAge),
    ltcStartAge: clampAge(base.ltcStartAge),
    yourDeathAge: clampAge(base.yourDeathAge),
    detailed: {
      ...base.detailed,
      rmdStartAgeYou: clampAge(base.detailed.rmdStartAgeYou),
      rmdStartAgeSpouse: clampAge(base.detailed.rmdStartAgeSpouse),
      withdrawalOrder: enumOrDefault(
        rd.withdrawalOrder,
        ['taxable-trad-roth', 'trad-taxable-roth'],
        fallback.detailed.withdrawalOrder,
      ),
      rothConversion: {
        ...base.detailed.rothConversion,
        mode: enumOrDefault(
          rRoth.mode,
          ['none', 'fixed', 'fillBracket', 'fillIrmaa', 'fillAca'],
          fallback.detailed.rothConversion.mode,
        ),
      },
      aca: {
        ...base.detailed.aca,
        rules: enumOrDefault(rAca.rules, ['cliff', 'enhanced'], fallback.detailed.aca.rules),
      },
    },
  };
}

function sanitizeBudgetItem(raw: unknown): BudgetItem | null {
  if (!isPlainObject(raw)) return null;
  const { id, name, monthly, note } = raw;
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  if (typeof monthly !== 'number' || !Number.isFinite(monthly)) return null;
  if (note !== undefined && typeof note !== 'string') return null;
  return note === undefined ? { id, name, monthly } : { id, name, monthly, note };
}

// Categories/items are user-growable lists (the Budget page lets you add line
// items), so — unlike PlanInputs — these are validated per-element rather
// than matched by position against the defaults; that would otherwise
// silently truncate anything a user added beyond the default set.
function sanitizeBudgetCategory(raw: unknown): BudgetCategory | null {
  if (!isPlainObject(raw)) return null;
  const { id, name, items, isHealthcare } = raw;
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  if (isHealthcare !== undefined && typeof isHealthcare !== 'boolean') return null;
  const cleanItems = Array.isArray(items)
    ? items.map(sanitizeBudgetItem).filter((i): i is BudgetItem => i !== null)
    : [];
  return isHealthcare === undefined ? { id, name, items: cleanItems } : { id, name, items: cleanItems, isHealthcare };
}

function sanitizeBudget(raw: unknown, fallback: Budget): Budget {
  if (!isPlainObject(raw) || !Array.isArray(raw.categories)) return fallback;
  const categories = raw.categories.map(sanitizeBudgetCategory).filter((c): c is BudgetCategory => c !== null);
  return categories.length > 0 ? { categories } : fallback;
}

function sanitizeScenario(raw: unknown): Scenario | null {
  if (!isPlainObject(raw)) return null;
  const { id, name, createdAt, inputs } = raw;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof createdAt !== 'string') return null;
  return { id, name, createdAt, inputs: sanitizeInputs(inputs, defaultInputs()) };
}

function sanitizeScenarios(raw: unknown): Scenario[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeScenario).filter((s): s is Scenario => s !== null);
}

export function loadState(): AppState {
  const fallback: AppState = { inputs: defaultInputs(), budget: defaultBudget(), scenarios: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    const p: Json = isPlainObject(parsed) ? parsed : {};
    const state: AppState = {
      inputs: sanitizeInputs(p.inputs, fallback.inputs),
      budget: sanitizeBudget(p.budget, fallback.budget),
      scenarios: sanitizeScenarios(p.scenarios),
    };
    // Snapshot this session's starting state as "last known good" before any
    // further edit, autosave, or import in this session can overwrite it —
    // gives the crash screen something to restore that predates whatever
    // just broke.
    try {
      localStorage.setItem(BACKUP_KEY, raw);
    } catch {
      // storage full or unavailable — recovery just won't have a backup
    }
    return state;
  } catch {
    return fallback;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    if (file.size > 10_000_000) {
      reject(new Error('File is too large to be a retirement-planner export'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result));
        const p: Json = isPlainObject(parsed) ? parsed : {};
        if (!isPlainObject(p.inputs)) throw new Error('Not a retirement-planner export file');
        resolve({
          inputs: sanitizeInputs(p.inputs, defaultInputs()),
          budget: sanitizeBudget(p.budget, defaultBudget()),
          scenarios: sanitizeScenarios(p.scenarios),
        });
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// Used by the crash screen: copies the last-known-good snapshot (captured at
// this session's startup, before whatever broke) back over the live state.
export function restoreLastGoodBackup(): boolean {
  try {
    const backup = localStorage.getItem(BACKUP_KEY);
    if (!backup) return false;
    localStorage.setItem(STORAGE_KEY, backup);
    return true;
  } catch {
    return false;
  }
}

// Used by the crash screen to let the user download whatever is currently on
// disk even though the running app has crashed and can't serialize its own
// in-memory state.
export function exportRawState(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retirement-plan-crash-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
