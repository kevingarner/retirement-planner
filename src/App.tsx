import { useEffect, useRef, useState } from 'react';
import type { PlanInputs } from './model/types';
import type { Budget } from './model/budget';
import { loadState, saveState, exportState, importState, lastExportAt, type Scenario, type AppState } from './state/storage';
import { ReportOverlay } from './components/Report';
import { useTheme } from './theme';
import { InputsPanel } from './components/InputsPanel';
import { Dashboard } from './pages/Dashboard';
import { MonteCarloPage } from './pages/MonteCarloPage';
import { ScenariosPage } from './pages/ScenariosPage';
import { SensitivityPage } from './pages/SensitivityPage';
import { BudgetPage } from './pages/BudgetPage';
import { RothExplorerPage } from './pages/RothExplorerPage';
import { BacktestPage } from './pages/BacktestPage';
import { StrategiesPage } from './pages/StrategiesPage';

type Page = 'dashboard' | 'montecarlo' | 'backtest' | 'scenarios' | 'sensitivity' | 'strategies' | 'roth' | 'budget';

const PAGES: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'montecarlo', label: 'Monte Carlo' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'sensitivity', label: 'Sensitivity' },
  { id: 'strategies', label: 'Strategies' },
  { id: 'roth', label: 'Roth Explorer' },
  { id: 'budget', label: 'Budget' },
];

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [page, setPage] = useState<Page>('dashboard');
  const [showReport, setShowReport] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(() => lastExportAt());
  const theme = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);

  const backupDays = lastExport ? Math.floor((Date.now() - new Date(lastExport).getTime()) / 86400000) : null;
  const backupStale = backupDays === null || backupDays > 30;
  const backupLabel =
    backupDays === null ? 'never backed up' : backupDays === 0 ? 'backed up today' : `backed up ${backupDays}d ago`;

  useEffect(() => {
    const t = setTimeout(() => saveState(state), 300);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    document.body.dataset.theme = theme.mode;
  }, [theme]);

  const setInputs = (inputs: PlanInputs) => setState((s) => ({ ...s, inputs }));
  const setBudget = (budget: Budget) => setState((s) => ({ ...s, budget }));

  const saveScenario = (name: string) =>
    setState((s) => ({
      ...s,
      scenarios: [
        ...s.scenarios,
        {
          id: `s${Date.now().toString(36)}`,
          name,
          inputs: JSON.parse(JSON.stringify(s.inputs)) as PlanInputs,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
  const deleteScenario = (id: string) =>
    setState((s) => ({ ...s, scenarios: s.scenarios.filter((x) => x.id !== id) }));
  const loadScenario = (scenario: Scenario) => {
    setInputs(JSON.parse(JSON.stringify(scenario.inputs)) as PlanInputs);
    setPage('dashboard');
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Retirement Planner</h1>
        <nav className="tabs">
          {PAGES.map((p) => (
            <button key={p.id} className={`tab ${page === p.id ? 'active' : ''}`} onClick={() => setPage(p.id)}>
              {p.label}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button className="btn subtle" onClick={() => setShowReport(true)}>
            Report
          </button>
          <span className={`backup-note ${backupStale ? 'warn' : ''}`} title="JSON backups via the Export button — app data lives only in this browser">
            {backupLabel}
          </span>
          <button
            className="btn subtle"
            onClick={() => {
              exportState(state);
              setLastExport(new Date().toISOString());
            }}
          >
            Export
          </button>
          <button className="btn subtle" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                setState(await importState(file));
              } catch (err) {
                alert(`Import failed: ${err instanceof Error ? err.message : err}`);
              }
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <InputsPanel inputs={state.inputs} onChange={setInputs} />
        </aside>
        <main className="main">
          {page === 'dashboard' && <Dashboard inputs={state.inputs} theme={theme} />}
          {page === 'montecarlo' && <MonteCarloPage inputs={state.inputs} theme={theme} />}
          {page === 'scenarios' && (
            <ScenariosPage
              inputs={state.inputs}
              scenarios={state.scenarios}
              theme={theme}
              onSave={saveScenario}
              onDelete={deleteScenario}
              onLoad={loadScenario}
            />
          )}
          {page === 'backtest' && <BacktestPage inputs={state.inputs} theme={theme} />}
          {page === 'sensitivity' && <SensitivityPage inputs={state.inputs} />}
          {page === 'strategies' && <StrategiesPage inputs={state.inputs} />}
          {page === 'roth' && (
            <RothExplorerPage
              inputs={state.inputs}
              onApply={(plan) =>
                setInputs({ ...state.inputs, detailed: { ...state.inputs.detailed, rothConversion: plan } })
              }
            />
          )}
          {page === 'budget' && (
            <BudgetPage
              budget={state.budget}
              goGoSpending={state.inputs.goGoSpending}
              onChange={setBudget}
              onPushToPlan={(annual) => {
                setInputs({ ...state.inputs, goGoSpending: Math.round(annual) });
              }}
            />
          )}
        </main>
      </div>

      <footer className="app-footer">
        This is a planning estimate based on the numbers and assumptions you enter — it is not financial, tax, or
        legal advice. Verify significant decisions with a qualified professional.
      </footer>

      {showReport && <ReportOverlay inputs={state.inputs} theme={theme} onClose={() => setShowReport(false)} />}
    </div>
  );
}
