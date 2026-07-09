# Retirement Planner

**New here? Read the [User Guide](docs/USER-GUIDE.md)** — how to use every page (with screenshots) and the yearly-update checklist.

A local, private retirement planning app: model your accounts, spending, Social Security, and taxes, plus tools a spreadsheet can't do (Monte Carlo, historical backtesting, sensitivity solvers, scenario comparison).

![Demo: editing the portfolio balance and touring Monte Carlo, Backtest, and Strategies](docs/img/demo.gif)

All data stays on this machine: inputs, budget, and scenarios are saved in the browser's localStorage, with JSON export/import for backups. The header shows how long it's been since the last export — browsers can wipe localStorage, so back up regularly. The **Report** button renders a one-page printable summary (verdict, assumptions, outcome stats including Monte Carlo and backtest success, charts, year table) — use the browser's print dialog to save it as a PDF.

## Run it

```bash
cd retirement-planner
npm install   # first time only
npm run dev   # then open the printed localhost:5173 URL
```

Or double-click **Start Retirement Planner.command** in Finder — it starts the server and opens the browser.

The dev server uses HTTPS when mkcert certificates exist in `.certs/` (Safari's HTTPS-Only mode refuses plain-HTTP localhost), and falls back to HTTP otherwise. One-time setup:

```bash
brew install mkcert
mkcert -install   # trusts the local CA; asks for your macOS password
mkcert -key-file .certs/localhost-key.pem -cert-file .certs/localhost.pem localhost 127.0.0.1 ::1
```

Note: the browser stores your data per-origin, so switching between `http://` and `https://` (or changing the port) makes the app look empty — your data is still under the other origin, or re-import your JSON backup.

## Sharing it

The app is a pure static site — no server, no accounts, no data collection. Anyone using a hosted copy keeps their data in their own browser, exactly like running it locally. Pushing the repo to GitHub (public) auto-deploys it to GitHub Pages via `.github/workflows/deploy-pages.yml`; enable Pages once under repo **Settings → Pages → Source: GitHub Actions**, then share the URL. It ships with generic example numbers — nobody's real finances are in this repo. It's an educational planning tool, not financial advice.

Sharing with someone non-technical (a parent, a friend who doesn't want to learn eight tabs)? Send them the **[Simple Guide](docs/SIMPLE-GUIDE.md)** instead of the full user guide — one page, no jargon, just "open the link and read the colored box."

## Pages

- **Dashboard** — verdict ("survives" / "runs out in 20XX"), stat tiles, portfolio balance chart (nominal + today's $), retirement cash-flow chart, year-by-year table. Everything recalculates instantly as you edit inputs in the left panel.
- **Monte Carlo** — randomized annual returns around your plan's rates; success probability and 10/25/50/75/90th-percentile bands.
- **Scenarios** — snapshot the current inputs under a name, tweak the plan, and compare balances on one chart (nominal or today's $).
- **Sensitivity** — breakeven solvers (max sustainable spending, earliest retirement age, required return) and a one-change-at-a-time table.
- **Backtest** — runs the plan through every complete historical window since 1928 (S&P 500 + 10-year Treasury real returns at a chosen stock allocation, re-based to the plan's inflation): success rate across all cohorts, percentile bands, and the toughest starting years. Data: Damodaran/NYU and BLS CPI, in `src/model/data/history.ts`.
- **Strategies** — fixed vs. guardrails withdrawal comparison (survival, Monte Carlo success, lifetime spending, worst-year cut) and Social Security claiming-age comparison (62 / 67 / 70 / split) via PIA actuarial factors.
- **Roth Explorer** — compares conversion strategies (none, fill 12/22/24% bracket, stay under IRMAA, stay under the ACA cliff) by lifetime taxes, ACA subsidies given up, and after-tax estate in today's dollars. Requires detailed tax mode.
- **Budget** — monthly budget tracker; pushes its non-savings, non-healthcare total into the plan's Go-Go spending input (healthcare is excluded because the projection models premiums, Medicare, and taxes separately).

## Tax modes

- **Simple** (default) — flat effective tax rates you set directly, for a fast at-a-glance projection.
- **Detailed** — account buckets (taxable with cost-basis tracking / traditional per spouse / Roth) with configurable withdrawal ordering; real 2026 federal brackets, standard deduction, capital-gains stacking, NIIT, and Social Security provisional-income taxability (single filing after a modeled first death); RMDs per the Uniform Lifetime Table; Roth conversion strategies; ACA premium subsidies from modeled MAGI (choose 400%-FPL-cliff or enhanced 8.5%-cap rules — the law was in flux when this was built); IRMAA tiers from MAGI with the 2-year lookback. Tax constants live in `src/model/tax/constants.ts` — update them as the IRS publishes new numbers. The cash reserve works in both modes; in detailed mode the reserve slice lives inside the taxable account.

## Additional planning tools

- **Income & expense events** — pensions, rental income, inheritance, part-time work, one-time or multi-year expenses; each with its own year range, inflation setting, and (in detailed mode) taxability. Surplus income is reinvested.
- **Withdrawal strategies** — fixed inflation-adjusted spending, or guardrails (spending cut/raise when the withdrawal rate drifts outside a band around its starting level).

## Core model features

Couples model with per-spouse ages/contributions/Medicare/Social Security; Go-Go/Slow-Go/No-Go spending phases; pre-Medicare family premiums stepping down as each spouse reaches Medicare; Medicare Part B/D with IRMAA and its own growth rate; effective-tax gross-up on withdrawals (pre/post-SS rates); SS with COLA and a funding-cut haircut; one-time expense; down-market sequence stress test; long-term care event; cash reserve bucket; survivor scenario.

## Verification

The simple engine's math is regression-locked: `src/model/__tests__/excel_ground_truth.json` holds a fixed reference output for a generic test plan, and `npm test` checks every projection row and summary value against it to within 1e-9 — any change to the engine's math fails the suite. Social Security, COLA, and survivor paths are additionally covered by hand-computed test cases derived independently from the underlying formulas, and the detailed tax engine has its own hand-verified bucket/RMD/conversion/ACA tests.
