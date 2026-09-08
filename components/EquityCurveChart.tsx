"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type { EquityPoint } from "@/lib/analytics/metrics";
import type { BenchmarkPoint } from "@/lib/analytics/benchmark";

type View = "cumulative" | "per-trade";
type MergedPoint = EquityPoint & { benchmarkPctChange?: number };

function formatMoney(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { style: "currency", currency: "USD" })}`;
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as MergedPoint;
  return (
    <div className="rounded border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-medium">
        {point.symbol} · {new Date(point.date).toLocaleDateString()}
      </p>
      <p className={point.pnl > 0 ? "text-emerald-600" : point.pnl < 0 ? "text-red-600" : ""}>
        This trade: {formatMoney(point.pnl)}
      </p>
      <p className="text-zinc-500">Cumulative: {formatMoney(point.cumulativePnl)}</p>
      {point.benchmarkPctChange != null && (
        <p className="text-blue-600">S&amp;P 500: {point.benchmarkPctChange >= 0 ? "+" : ""}{point.benchmarkPctChange.toFixed(1)}%</p>
      )}
    </div>
  );
}

export function EquityCurveChart({
  data,
  benchmark,
}: {
  data: EquityPoint[];
  /** Aligned S&P 500 % change per point, same length/order as `data`. Null if unavailable (e.g. the historical-data provider failed). */
  benchmark?: BenchmarkPoint[] | null;
}) {
  const [view, setView] = useState<View>("cumulative");
  const [showBenchmark, setShowBenchmark] = useState(false);

  if (data.length === 0) {
    return <p className="text-sm text-zinc-500">No closed trades yet.</p>;
  }

  const hasBenchmark = !!benchmark && benchmark.length === data.length;
  const merged: MergedPoint[] = hasBenchmark
    ? data.map((point, i) => ({ ...point, benchmarkPctChange: benchmark[i].pctChange }))
    : data;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-4">
        {hasBenchmark && view === "cumulative" && (
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            <input type="checkbox" checked={showBenchmark} onChange={(e) => setShowBenchmark(e.target.checked)} />
            Compare to S&amp;P 500
          </label>
        )}
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          View
          <select
            value={view}
            onChange={(e) => setView(e.target.value as View)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="cumulative">Cumulative P&amp;L</option>
            <option value="per-trade">Per-trade P&amp;L</option>
          </select>
        </label>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        {view === "cumulative" ? (
          <LineChart data={merged}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
            <XAxis dataKey="date" tickFormatter={(d: string) => new Date(d).toLocaleDateString()} tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            {showBenchmark && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12 }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              />
            )}
            <Tooltip content={ChartTooltip} />
            {showBenchmark && <Legend wrapperStyle={{ fontSize: 12 }} />}
            <Line yAxisId="left" type="monotone" dataKey="cumulativePnl" name="Your P&L" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            {showBenchmark && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="benchmarkPctChange"
                name="S&P 500"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
              />
            )}
          </LineChart>
        ) : (
          <BarChart data={merged}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
            <XAxis dataKey="date" tickFormatter={(d: string) => new Date(d).toLocaleDateString()} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <Tooltip content={ChartTooltip} />
            <Bar dataKey="pnl">
              {merged.map((point) => (
                <Cell key={point.tradeId} fill={point.pnl >= 0 ? "#10b981" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
