import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import type { ProjectionResult } from '../model/types';
import type { MonteCarloResult } from '../model/montecarlo';
import type { Theme } from '../theme';
import { moneyCompact, money } from '../format';

const axisTick = (theme: Theme) => ({ fill: theme.muted, fontSize: 12 });

// Legend text wears text tokens; the swatch beside it carries the series color
const legendText = (theme: Theme) => (value: string) => <span style={{ color: theme.ink2 }}>{value}</span>;

function chartFrame(theme: Theme) {
  return {
    grid: <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />,
    tooltipStyle: {
      backgroundColor: theme.surface,
      border: `1px solid ${theme.grid}`,
      borderRadius: 8,
      color: theme.ink,
      fontSize: 13,
    },
  };
}

export function BalanceChart({ result, theme }: { result: ProjectionResult; theme: Theme }) {
  const { grid, tooltipStyle } = chartFrame(theme);
  const data = result.rows.map((r) => ({
    year: r.year,
    Nominal: Math.round(r.endBalance),
    "Today's $": Math.round(r.endBalanceReal),
  }));
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        {grid}
        <XAxis dataKey="year" tick={axisTick(theme)} axisLine={{ stroke: theme.axis }} tickLine={false} />
        <YAxis tickFormatter={moneyCompact} tick={axisTick(theme)} axisLine={false} tickLine={false} width={70} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 13 }} formatter={legendText(theme)} />
        <ReferenceLine
          x={result.retirementYearYou}
          stroke={theme.axis}
          strokeWidth={1}
          label={{ value: 'Retire', fill: theme.muted, fontSize: 12, position: 'insideTopLeft' }}
        />
        <Area dataKey="Nominal" stroke={theme.series[0]} strokeWidth={2} fill={theme.series[0]} fillOpacity={0.1} dot={false} />
        <Line dataKey="Today's $" stroke={theme.series[1]} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function CashflowChart({ result, theme }: { result: ProjectionResult; theme: Theme }) {
  const { grid, tooltipStyle } = chartFrame(theme);
  const data = result.rows
    .filter((r) => r.phase === 'Retirement')
    .map((r) => ({
      year: r.year,
      Spending: Math.round(r.spending),
      Healthcare: Math.round(r.medicare + r.preMedicareInsurance),
      Taxes: Math.round(r.estimatedTaxes),
      'Long-term care': Math.round(r.ltcCost),
      'Social Security': Math.round(r.totalSS),
    }));
  if (data.length === 0) return <div className="empty-note">No retirement years in this projection.</div>;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }} barCategoryGap={2}>
        {grid}
        <XAxis dataKey="year" tick={axisTick(theme)} axisLine={{ stroke: theme.axis }} tickLine={false} />
        <YAxis tickFormatter={moneyCompact} tick={axisTick(theme)} axisLine={false} tickLine={false} width={70} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 13 }} formatter={legendText(theme)} />
        <Bar dataKey="Spending" stackId="out" fill={theme.series[0]} stroke={theme.surface} strokeWidth={1} />
        <Bar dataKey="Healthcare" stackId="out" fill={theme.series[1]} stroke={theme.surface} strokeWidth={1} />
        <Bar dataKey="Taxes" stackId="out" fill={theme.series[2]} stroke={theme.surface} strokeWidth={1} />
        <Bar dataKey="Long-term care" stackId="out" fill={theme.series[3]} stroke={theme.surface} strokeWidth={1} />
        <Line dataKey="Social Security" stroke={theme.series[4]} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function MonteCarloChart({
  mc,
  theme,
}: {
  mc: Pick<MonteCarloResult, 'years' | 'percentiles'>; // also fits backtest results
  theme: Theme;
}) {
  const { grid, tooltipStyle } = chartFrame(theme);
  // Bands are drawn as stacked areas: invisible base + deltas
  const data = mc.years.map((year, t) => ({
    year,
    p10: Math.round(mc.percentiles.p10[t]),
    band10_90: [Math.round(mc.percentiles.p10[t]), Math.round(mc.percentiles.p90[t])],
    band25_75: [Math.round(mc.percentiles.p25[t]), Math.round(mc.percentiles.p75[t])],
    Median: Math.round(mc.percentiles.p50[t]),
  }));
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        {grid}
        <XAxis dataKey="year" tick={axisTick(theme)} axisLine={{ stroke: theme.axis }} tickLine={false} />
        <YAxis tickFormatter={moneyCompact} tick={axisTick(theme)} axisLine={false} tickLine={false} width={70} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, name) => {
            if (Array.isArray(v)) return [`${money(Number(v[0]))} – ${money(Number(v[1]))}`, name];
            return [money(Number(v)), name];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 13 }} formatter={legendText(theme)} />
        <Area dataKey="band10_90" name="10th–90th percentile" stroke="none" fill={theme.seqBand} fillOpacity={0.6} />
        <Area dataKey="band25_75" name="25th–75th percentile" stroke="none" fill={theme.seqBandMid} fillOpacity={0.5} />
        <Line dataKey="Median" stroke={theme.seqLine} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Detailed mode: stacked area of taxable / traditional / Roth balances
export function AccountChart({ result, theme }: { result: ProjectionResult; theme: Theme }) {
  const { grid, tooltipStyle } = chartFrame(theme);
  const data = result.rows
    .filter((r) => r.detail)
    .map((r) => ({
      year: r.year,
      Taxable: Math.round(r.detail!.taxableBalance),
      Traditional: Math.round(r.detail!.traditionalBalance),
      Roth: Math.round(r.detail!.rothBalance),
    }));
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        {grid}
        <XAxis dataKey="year" tick={axisTick(theme)} axisLine={{ stroke: theme.axis }} tickLine={false} />
        <YAxis tickFormatter={moneyCompact} tick={axisTick(theme)} axisLine={false} tickLine={false} width={70} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 13 }} formatter={legendText(theme)} />
        <Area dataKey="Taxable" stackId="acct" stroke={theme.surface} strokeWidth={1} fill={theme.series[0]} fillOpacity={0.55} />
        <Area dataKey="Traditional" stackId="acct" stroke={theme.surface} strokeWidth={1} fill={theme.series[1]} fillOpacity={0.55} />
        <Area dataKey="Roth" stackId="acct" stroke={theme.surface} strokeWidth={1} fill={theme.series[2]} fillOpacity={0.55} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export interface OverlaySeries {
  name: string;
  color: string;
  rows: { year: number; balance: number }[];
}

export function ScenarioOverlayChart({ series, theme }: { series: OverlaySeries[]; theme: Theme }) {
  const { grid, tooltipStyle } = chartFrame(theme);
  const years = new Set<number>();
  for (const s of series) for (const r of s.rows) years.add(r.year);
  const data = [...years].sort((a, b) => a - b).map((year) => {
    const point: Record<string, number> = { year };
    for (const s of series) {
      const row = s.rows.find((r) => r.year === year);
      if (row) point[s.name] = Math.round(row.balance);
    }
    return point;
  });
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        {grid}
        <XAxis dataKey="year" tick={axisTick(theme)} axisLine={{ stroke: theme.axis }} tickLine={false} />
        <YAxis tickFormatter={moneyCompact} tick={axisTick(theme)} axisLine={false} tickLine={false} width={70} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 13 }} formatter={legendText(theme)} />
        {series.map((s) => (
          <Line key={s.name} dataKey={s.name} stroke={s.color} strokeWidth={2} dot={false} connectNulls />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
