"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { getTradeReviewBars, type BarInterval, type ChartBar } from "@/app/actions/priceHistory";
import { easternParts } from "@/lib/time";

/**
 * "Did I make the right call" chart for a trade's detail page: real daily/
 * weekly/monthly price bars (via the same free Stooq data used elsewhere)
 * with the trade's entry, exit, planned stop, and planned target drawn as
 * reference lines over them - so the plan and the actual price action sit
 * on the same picture instead of living only in the numbers above.
 */

const INTERVAL_LABEL: Record<BarInterval, string> = { d: "Daily", w: "Weekly", m: "Monthly" };

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const bar = payload[0].payload as ChartBar;
  return (
    <div className="rounded border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-medium">{new Date(bar.date).toLocaleDateString()}</p>
      <p>Close: ${bar.close.toFixed(2)}</p>
      {bar.high != null && bar.low != null && (
        <p className="text-zinc-500">
          Range: ${bar.low.toFixed(2)} – ${bar.high.toFixed(2)}
        </p>
      )}
    </div>
  );
}

export function TradeReviewChart({
  symbol,
  entryTime,
  exitTime,
  entryPrice,
  exitPrice,
  plannedStop,
  plannedTarget,
}: {
  symbol: string;
  entryTime: string;
  exitTime: string | null;
  entryPrice: number;
  exitPrice: number | null;
  plannedStop: number | null;
  plannedTarget: number | null;
}) {
  const [chartInterval, setChartInterval] = useState<BarInterval>("d");
  const [bars, setBars] = useState<ChartBar[] | null | undefined>(undefined); // undefined = loading, null = unavailable

  useEffect(() => {
    let cancelled = false;
    getTradeReviewBars(symbol, entryTime, exitTime, chartInterval).then((result) => {
      if (!cancelled) setBars(result);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, entryTime, exitTime, chartInterval]);

  const entryDate = easternParts(new Date(entryTime)).isoDate;
  const exitDate = exitTime ? easternParts(new Date(exitTime)).isoDate : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Trade review</h2>
        <div className="flex gap-1">
          {(Object.keys(INTERVAL_LABEL) as BarInterval[]).map((i) => (
            <button
              key={i}
              onClick={() => {
                setBars(undefined); // show "loading" immediately, rather than the stale previous interval's chart
                setChartInterval(i);
              }}
              className={`rounded px-2.5 py-1 text-xs ${
                chartInterval === i
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              }`}
            >
              {INTERVAL_LABEL[i]}
            </button>
          ))}
        </div>
      </div>

      {bars === undefined && <p className="text-sm text-zinc-500">Loading chart…</p>}
      {bars === null && <p className="text-sm text-zinc-400">No price history available for this symbol right now.</p>}
      {bars && bars.length === 0 && <p className="text-sm text-zinc-400">No price history available for this symbol right now.</p>}

      {bars && bars.length > 0 && (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={bars}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
            <XAxis dataKey="date" tickFormatter={(d: string) => new Date(d).toLocaleDateString()} tick={{ fontSize: 12 }} />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 12 }}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            <Tooltip content={ChartTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />

            <Line type="monotone" dataKey="close" name={symbol} stroke="#3b82f6" strokeWidth={2} dot={false} />

            <ReferenceLine y={entryPrice} stroke="#71717a" strokeDasharray="4 3" ifOverflow="extendDomain" label={{ value: "Entry", position: "insideLeft", fontSize: 11, fill: "#71717a" }} />
            {exitPrice != null && (
              <ReferenceLine y={exitPrice} stroke="#a1a1aa" strokeDasharray="2 2" ifOverflow="extendDomain" label={{ value: "Exit", position: "insideLeft", fontSize: 11, fill: "#a1a1aa" }} />
            )}
            {plannedStop != null && (
              <ReferenceLine y={plannedStop} stroke="#ef4444" strokeDasharray="4 3" ifOverflow="extendDomain" label={{ value: "Stop", position: "insideLeft", fontSize: 11, fill: "#ef4444" }} />
            )}
            {plannedTarget != null && (
              <ReferenceLine y={plannedTarget} stroke="#10b981" strokeDasharray="4 3" ifOverflow="extendDomain" label={{ value: "Target", position: "insideLeft", fontSize: 11, fill: "#10b981" }} />
            )}

            <ReferenceLine x={entryDate} stroke="#71717a" ifOverflow="extendDomain" />
            {exitDate && <ReferenceLine x={exitDate} stroke="#a1a1aa" ifOverflow="extendDomain" />}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
