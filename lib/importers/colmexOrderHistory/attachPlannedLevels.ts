import type { ParsedTrade } from "@/lib/importers/types";
import { extractBracketCandidates, type BracketCandidate } from "@/lib/importers/colmexOrderHistory/parse";

// Bracket (Stop Loss/Take Profit) orders are placed alongside the entry and
// resolve (filled or cancelled - whichever leg didn't get hit is auto
// -cancelled the moment the other one does) at or shortly after exit. Real
// sample: a Stop Loss row `Filled` at the same instant the trade's exit fill
// happened, and its paired Take Profit row `Cancelled` a full second later.
// So a candidate's own "Update Time" can land slightly before entry (order
// placed just ahead of the fill) or slightly after exit (the cancellation),
// not strictly inside [entryTime, exitTime]. This buffer absorbs that.
const WINDOW_BUFFER_MS = 5 * 60_000;

/**
 * Backfills plannedStop/plannedTarget onto grouped trades by matching each
 * trade's symbol + lifecycle window against the bracket-order candidates
 * extracted from the same Order History file. When a trade has more than
 * one candidate of the same kind in its window (e.g. a stop that was moved),
 * the earliest is used - that's the level as originally planned, before any
 * live adjustment.
 */
export function attachPlannedLevels(
  trades: ParsedTrade[],
  raw: string,
  opts: { sourceTimeZone: string },
): ParsedTrade[] {
  const candidates = extractBracketCandidates(raw, opts);
  if (candidates.length === 0) return trades;

  const bySymbol = new Map<string, BracketCandidate[]>();
  for (const c of candidates) {
    const list = bySymbol.get(c.symbol) ?? [];
    list.push(c);
    bySymbol.set(c.symbol, list);
  }

  return trades.map((trade) => {
    if (!trade.entryTime) return trade; // entryKnown: false - no window to match against
    const pool = bySymbol.get(trade.symbol);
    if (!pool) return trade;

    const windowStart = trade.entryTime.getTime() - WINDOW_BUFFER_MS;
    const windowEnd = (trade.exitTime ?? new Date()).getTime() + WINDOW_BUFFER_MS;

    const inWindow = pool.filter((c) => {
      const t = c.time.getTime();
      return t >= windowStart && t <= windowEnd;
    });
    if (inWindow.length === 0) return trade;

    const earliestOf = (kind: BracketCandidate["kind"]) =>
      inWindow
        .filter((c) => c.kind === kind)
        .sort((a, b) => a.time.getTime() - b.time.getTime())[0];

    const stop = earliestOf("stop");
    const target = earliestOf("target");
    if (!stop && !target) return trade;

    return {
      ...trade,
      plannedStop: stop ? stop.price : trade.plannedStop,
      plannedTarget: target ? target.price : trade.plannedTarget,
    };
  });
}
