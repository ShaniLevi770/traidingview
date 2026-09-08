"use client";

import { useEffect, useRef } from "react";

/**
 * TradingView's free "Advanced Chart" embeddable widget - display only.
 * There is no TradingView API to fetch data from; this just renders their
 * hosted iframe. See lib/quotes/finnhub.ts for the (separate) source of
 * the actual price number used in unrealized P&L math.
 *
 * `symbol` is passed as-is (e.g. "AAPL") - the widget resolves a bare
 * ticker to a default listing itself. `allow_symbol_change` lets the user
 * correct it in-widget if it resolves to the wrong exchange.
 */

// Widget-supported preset ranges, smallest to largest.
type RangePreset = "5D" | "1M" | "3M" | "6M" | "12M" | "60M" | "ALL";

/**
 * Picks a default zoom level from the trade's own duration, instead of
 * relying on the widget's default (which shows a fixed, often much longer,
 * window regardless of how long the trade actually was - leaving daily
 * candles so thin/compressed across a full-width chart that they're
 * unreadable and hard to interact with). Biased toward a tighter window
 * than the trade's exact span, so there's some before/after context without
 * candles becoming pixel-thin again on a long-held trade.
 */
export function defaultRangeFor(durationDays: number): RangePreset {
  if (durationDays <= 5) return "5D";
  if (durationDays <= 20) return "1M";
  if (durationDays <= 50) return "3M";
  if (durationDays <= 100) return "6M";
  if (durationDays <= 200) return "12M";
  return "60M";
}

export function TradingViewWidget({
  symbol,
  entryTime,
  exitTime,
}: {
  symbol: string;
  /** ISO timestamps, used only to pick a sensible default zoom level - see defaultRangeFor. */
  entryTime?: string;
  exitTime?: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    el.innerHTML = "";

    const durationDays = entryTime
      ? (new Date(exitTime ?? Date.now()).getTime() - new Date(entryTime).getTime()) / 86_400_000
      : null;
    const range = durationDays != null ? defaultRangeFor(Math.max(durationDays, 0)) : "3M";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.text = JSON.stringify({
      autosize: true,
      symbol,
      interval: "D",
      range,
      timezone: "America/New_York",
      theme: "light",
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      support_host: "https://www.tradingview.com",
    });
    el.appendChild(script);
  }, [symbol, entryTime, exitTime]);

  return (
    <div className="tradingview-widget-container h-[80vh] min-h-[500px] w-full" ref={container} />
  );
}
