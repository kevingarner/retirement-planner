import { describe, it, expect } from 'vitest';
import { benefitAtAge, compareClaimingStrategies } from '../claiming';
import { runBacktest } from '../backtest';
import { HISTORY } from '../data/history';
import { defaultInputs } from '../defaults';

describe('SS claiming factors', () => {
  it('converts through PIA correctly', () => {
    // $30,000 at 67 (FRA) → PIA 30,000 → 70% at 62, 124% at 70
    expect(benefitAtAge(30000, 67, 62)).toBeCloseTo(21000, 0);
    expect(benefitAtAge(30000, 67, 70)).toBeCloseTo(37200, 0);
    // Round-trip: benefit stated at 62 back to 62
    expect(benefitAtAge(21000, 62, 62)).toBeCloseTo(21000, 0);
    // Stated at 70, asked at FRA
    expect(benefitAtAge(37200, 70, 67)).toBeCloseTo(30000, 0);
  });

  it('produces four strategies with delayed claiming yielding larger benefits', () => {
    const results = compareClaimingStrategies(defaultInputs());
    expect(results).toHaveLength(4);
    const at62 = results.find((r) => r.label.includes('62') && r.youAge === 62 && r.spouseAge === 62)!;
    const at70 = results.find((r) => r.youAge === 70 && r.spouseAge === 70)!;
    expect(at62.lifetimeSS).toBeGreaterThan(0);
    expect(at70.lifetimeSS).toBeGreaterThan(0);
    // Living to 95, delaying should collect more in total than claiming at 62
    expect(at70.lifetimeSS).toBeGreaterThan(at62.lifetimeSS);
  });
});

describe('historical backtest', () => {
  it('runs every complete window and reports coherent stats', () => {
    const i = defaultInputs(); // 46 projection years (age 50 → 95)
    i.startYear = 2026;
    const bt = runBacktest(i, 0.7)!;
    expect(bt).not.toBeNull();
    const expectedWindows = HISTORY.length - (i.you.lifeExpectancy - i.you.currentAge + 1) + 1;
    expect(bt.windows.length).toBe(expectedWindows);
    expect(bt.successRate).toBeGreaterThanOrEqual(0);
    expect(bt.successRate).toBeLessThanOrEqual(1);
    expect(bt.worst.length).toBe(5);
    // Percentiles are ordered
    const mid = Math.floor(bt.years.length / 2);
    expect(bt.percentiles.p10[mid]).toBeLessThanOrEqual(bt.percentiles.p50[mid]);
    expect(bt.percentiles.p50[mid]).toBeLessThanOrEqual(bt.percentiles.p90[mid]);
  });

  it('returns null when the horizon exceeds the record', () => {
    const i = defaultInputs();
    i.you.lifeExpectancy = 160;
    expect(runBacktest(i, 0.7)).toBeNull();
  });

  it('100% bonds differs from 100% stocks', () => {
    const i = defaultInputs();
    const stocks = runBacktest(i, 1)!;
    const bonds = runBacktest(i, 0)!;
    expect(stocks.medianFinalBalanceReal).not.toBeCloseTo(bonds.medianFinalBalanceReal, -3);
  });
});
