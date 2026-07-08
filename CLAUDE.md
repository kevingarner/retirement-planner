# Retirement Planner — project notes

React 19 + Vite + TypeScript + Recharts. `npm run dev` (port 5173, HTTPS when `.certs/` exists), `npm test` (vitest), `npm run build`.

## Invariants — do not break

- **The simple engine (`src/model/projection.ts`) is regression-locked.** It ports the owner's Excel workbook and was originally verified cell-for-cell against it. `src/model/__tests__/excel_ground_truth.json` locks its output to 1e-9; if you change its math deliberately, regenerate the fixture and say so loudly. Quirks that look like bugs (cash reserve modeled as a return adjustment, surplus SS discarded in simple mode) are faithful workbook behavior — keep them.
- **Private data never enters this repo.** The owner's real financial numbers live in `~/ClaudeCode/my-plan-private.json` (outside the repo) and in the original Excel workbook. The committed fixture and defaults are generic on purpose. Git history was once rewritten to purge real numbers — don't reintroduce them in code, tests, or fixtures.
- **Port/origin is fixed at `https://localhost:5173`.** Browser localStorage is keyed to that origin; changing port or scheme makes user data appear lost.

## Architecture in one paragraph

`runPlan()` in `src/model/detailed.ts` dispatches on `inputs.taxMode`: `'simple'` → the parity-locked engine (flat effective tax rates), `'detailed'` → the bucket engine (taxable/traditional/Roth with basis tracking, real 2026 federal brackets in `src/model/tax/`, RMDs, Roth conversion strategies, ACA subsidies, MAGI→IRMAA with 2-year lookback, solved by a 40-iteration fixed point). Monte Carlo, backtest, sensitivity, and all pages call `runPlan`, never an engine directly. State persists to localStorage (`src/state/storage.ts`) with deep-merge over defaults for forward compatibility.

## Maintenance

- `src/model/tax/constants.ts` holds 2026 tax law (brackets, deduction, LTCG, IRMAA tiers, FPL, ACA curve, Uniform Lifetime Table) — refresh annually.
- Historical returns (`src/model/data/history.ts`): Damodaran/NYU stocks & bonds, BLS CPI, 1928–2025 — append new years as published.
