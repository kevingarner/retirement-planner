// Regenerates the user-guide screenshots from the running app using the
// GENERIC default plan (never real data — these images are committed).
//
// Usage: start the dev server, then:  node docs/screenshots.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const URL = process.env.APP_URL ?? 'https://localhost:5173';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'img');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const shoot = async (name, selector = 'main.main') => {
  await page.waitForTimeout(1800); // let Recharts' draw animation finish
  const el = page.locator(selector).first();
  await el.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`✓ ${name}.png`);
};
const tab = async (label) => {
  await page.click(`nav.tabs button:text-is("${label}")`);
  await page.waitForTimeout(400);
};

// Fresh profile → app loads generic defaults
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.verdict');

// Header (Report / backup note / Export / Import)
await shoot('header', '.app-header');

// Inputs panel — full sidebar as loaded
await shoot('inputs-panel', 'aside.sidebar');

// Each page on the generic default plan
await shoot('dashboard');
await tab('Monte Carlo');
await page.waitForTimeout(1500);
await shoot('monte-carlo');
await tab('Backtest');
await page.waitForTimeout(1500);
await shoot('backtest');
await tab('Scenarios');
await shoot('scenarios');
await tab('Sensitivity');
await page.waitForTimeout(1500);
await shoot('sensitivity');
await tab('Strategies');
await page.waitForTimeout(4000); // runs Monte Carlo twice
await shoot('strategies');
await tab('Budget');
await shoot('budget');

// Detailed tax mode: partial state merges over defaults on load
await page.evaluate(() => {
  localStorage.setItem('retirement-planner-v1', JSON.stringify({ inputs: { taxMode: 'detailed' }, scenarios: [] }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.verdict');
await shoot('dashboard-detailed');
await tab('Roth Explorer');
await page.waitForTimeout(3000);
await shoot('roth-explorer');

// Report overlay (back on simple defaults for consistency)
await page.evaluate(() => localStorage.removeItem('retirement-planner-v1'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.verdict');
await page.click('.header-actions button:text-is("Report")');
await page.waitForTimeout(3000); // report runs Monte Carlo + backtest
await shoot('report', '.report-page');

await browser.close();
console.log(`\nAll screenshots written to ${OUT}`);
