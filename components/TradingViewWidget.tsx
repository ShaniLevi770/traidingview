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
export function TradingViewWidget({ symbol }: { symbol: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    el.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.text = JSON.stringify({
      autosize: true,
      symbol,
      interval: "D",
      timezone: "America/New_York",
      theme: "light",
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      support_host: "https://www.tradingview.com",
    });
    el.appendChild(script);
  }, [symbol]);

  return (
    <div className="tradingview-widget-container h-[650px] w-full" ref={container} />
  );
}
