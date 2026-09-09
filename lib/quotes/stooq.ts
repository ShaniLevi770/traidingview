import "server-only";
import { parseStooqCsv, type DailyClose } from "@/lib/quotes/stooq-parse";

/**
 * Historical daily/weekly/monthly bars, free, no API key. Originally added
 * just for the S&P 500 overlay on the dashboard equity curve (daily only);
 * now also backs the post-trade diagnosis checks and the trade review
 * chart, both of which need the interval choice. Separate from
 * lib/quotes/finnhub.ts (current-price quotes for open positions) because
 * Finnhub's free tier blocks historical/candle data (403) - confirmed
 * while planning the S&P 500 feature, so a different provider was needed.
 *
 * NOTE: this session's own sandbox network policy blocks external hosts
 * (including stooq.com), so this couldn't be exercised against a live
 * response while building it, unlike the Colmex importer. The CSV format
 * (see stooq-parse.ts) is Stooq's long-documented, widely-used format,
 * verified here only against a synthetic sample (scripts/verify-spy-overlay.ts)
 * - verify this actually works once deployed (Vercel's servers aren't
 * behind this sandbox's proxy).
 */

export type { DailyClose };
export type BarInterval = "d" | "w" | "m";

interface CacheEntry {
  data: DailyClose[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // historical data for past dates doesn't change
const cache = new Map<string, CacheEntry>();

function yyyymmdd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/** Stooq expects e.g. "spy.us" for US tickers. */
function toStooqSymbol(symbol: string): string {
  return `${symbol.toLowerCase()}.us`;
}

export async function getHistoricalCloses(
  symbol: string,
  from: Date,
  to: Date,
  interval: BarInterval = "d",
): Promise<DailyClose[] | null> {
  const cacheKey = `${symbol}:${yyyymmdd(from)}:${yyyymmdd(to)}:${interval}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `https://stooq.com/q/d/l/?s=${toStooqSymbol(symbol)}&d1=${yyyymmdd(from)}&d2=${yyyymmdd(to)}&i=${interval}`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = parseStooqCsv(await res.text());
  if (!data) return null;

  cache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}
