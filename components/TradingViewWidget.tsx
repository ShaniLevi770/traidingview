"use client";

import { useEffect, useRef, useState } from "react";

/**
 * TradingView's free "Advanced Chart" embeddable widget - display only.
 * There is no TradingView API to fetch data from; this just renders their
 * hosted iframe. See lib/quotes/finnhub.ts for the (separate) source of
 * the actual price number used in unrealized P&L math.
 *
 * `symbol` is passed as-is (e.g. "AAPL") - the widget resolves a bare
 * ticker to a default listing itself. `allow_symbol_change` lets the user
 * correct it in-widget if it resolves to the wrong exchange.
 *
 * Sizing: two previous attempts (a Tailwind vh class, then an inline vh
 * style + "autosize") both apparently still rendered far shorter than
 * intended (reported live as "1/10 of the screen"), and this environment
 * has no way to render/screenshot the page to debug the CSS cascade
 * directly. Rather than guess at container/DOM structure a third time,
 * this drops `autosize` (which sizes off the container's CSS - exactly the
 * thing that kept silently failing) and instead computes an explicit pixel
 * height from the real browser window at mount time, passed straight into
 * the widget's own JSON config. No inherited CSS chain for it to fail on.
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

const MIN_HEIGHT_PX = 500;

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
  // null until mounted (window isn't available during server render) - the
  // container renders at MIN_HEIGHT_PX until this resolves, then the real
  // widget mounts at the actual computed height.
  const [heightPx, setHeightPx] = useState<number | null>(null);

  useEffect(() => {
    function computeHeight() {
      setHeightPx(Math.max(Math.round(window.innerHeight * 0.75), MIN_HEIGHT_PX));
    }
    computeHeight();
    window.addEventListener("resize", computeHeight);
    return () => window.removeEventListener("resize", computeHeight);
  }, []);

  useEffect(() => {
    const outer = container.current;
    if (!outer || heightPx == null) return;
    outer.innerHTML = "";

    const durationDays = entryTime
      ? (new Date(exitTime ?? Date.now()).getTime() - new Date(entryTime).getTime()) / 86_400_000
      : null;
    const range = durationDays != null ? defaultRangeFor(Math.max(durationDays, 0)) : "3M";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.text = JSON.stringify({
      symbol,
      interval: "D",
      range,
      timezone: "America/New_York",
      theme: "light",
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      hide_side_toolbar: false, // show the drawing-tools sidebar (trend lines, fib, etc.) - useful for the trade thesis/notes
      withdateranges: true,
      details: true,
      support_host: "https://www.tradingview.com",
      // Explicit pixel dimensions instead of autosize - see file comment.
      width: "100%",
      height: heightPx,
    });
    outer.appendChild(script);
  }, [symbol, entryTime, exitTime, heightPx]);

  return (
    <div
      className="tradingview-widget-container w-full"
      style={{ height: heightPx ?? MIN_HEIGHT_PX }}
      ref={container}
    />
  );
}
