import "server-only";

/**
 * Current-price lookups for unrealized P&L on open positions. Not related
 * to the TradingView chart widget (that's display-only) - TradingView has
 * no callable quotes API, so this is a separate, purpose-fit provider.
 *
 * Server-only: FINNHUB_API_KEY must never reach the client.
 */

interface CacheEntry {
  price: number;
  fetchedAt: number;
}

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes - "roughly current", not tick-accurate
const cache = new Map<string, CacheEntry>();

export interface Quote {
  symbol: string;
  price: number;
  asOf: string; // ISO timestamp of the cached/fetched value
}

export async function getQuote(symbol: string): Promise<Quote | null> {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { symbol, price: cached.price, asOf: new Date(cached.fetchedAt).toISOString() };
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn("FINNHUB_API_KEY is not set - unrealized P&L will be unavailable.");
    return null;
  }

  const res = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;

  const data = (await res.json()) as { c?: number };
  if (!data.c) return null; // Finnhub returns c: 0 for an unknown symbol

  const fetchedAt = Date.now();
  cache.set(symbol, { price: data.c, fetchedAt });
  return { symbol, price: data.c, asOf: new Date(fetchedAt).toISOString() };
}

/** (current − entry) × qty × (±1 for long/short) - the unrealized P&L formula, kept next to the quote fetch since both belong to "open position math", not the realized-P&L analytics module. */
export function unrealizedPnl(opts: {
  side: "long" | "short";
  entryPrice: number;
  quantity: number;
  currentPrice: number;
}): number {
  const diff = opts.currentPrice - opts.entryPrice;
  return (opts.side === "long" ? diff : -diff) * opts.quantity;
}
