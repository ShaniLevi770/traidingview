"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { EquityPoint } from "@/lib/analytics/metrics";

export function EquityCurveChart({ data }: { data: EquityPoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-zinc-500">No closed trades yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
        <XAxis dataKey="date" tickFormatter={(d: string) => new Date(d).toLocaleDateString()} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
        <Tooltip
          labelFormatter={(d) => new Date(String(d)).toLocaleString()}
          formatter={(v) => [`$${Number(v).toFixed(2)}`, "Cumulative P&L"]}
        />
        <Line type="monotone" dataKey="cumulativePnl" stroke="#10b981" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
