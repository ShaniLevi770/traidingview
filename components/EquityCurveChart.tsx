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
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type { EquityPoint } from "@/lib/analytics/metrics";

type View = "cumulative" | "per-trade";

function formatMoney(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { style: "currency", currency: "USD" })}`;
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as EquityPoint;
  return (
    <div className="rounded border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-medium">
        {point.symbol} · {new Date(point.date).toLocaleDateString()}
      </p>
      <p className={point.pnl > 0 ? "text-emerald-600" : point.pnl < 0 ? "text-red-600" : ""}>
        This trade: {formatMoney(point.pnl)}
      </p>
      <p className="text-zinc-500">Cumulative: {formatMoney(point.cumulativePnl)}</p>
    </div>
  );
}

export function EquityCurveChart({ data }: { data: EquityPoint[] }) {
  const [view, setView] = useState<View>("cumulative");

  if (data.length === 0) {
    return <p className="text-sm text-zinc-500">No closed trades yet.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
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
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
            <XAxis dataKey="date" tickFormatter={(d: string) => new Date(d).toLocaleDateString()} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <Tooltip content={ChartTooltip} />
            <Line type="monotone" dataKey="cumulativePnl" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
            <XAxis dataKey="date" tickFormatter={(d: string) => new Date(d).toLocaleDateString()} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <Tooltip content={ChartTooltip} />
            <Bar dataKey="pnl">
              {data.map((point) => (
                <Cell key={point.tradeId} fill={point.pnl >= 0 ? "#10b981" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
