import type { BarInterval } from "@/lib/quotes/stooq";
import { addIsoDays } from "@/lib/time";

/**
 * How much before/after the trade itself to fetch bars for, per interval -
 * enough context to see the trade's setup and its aftermath without
 * fetching years of unrelated history. Daily bars get roughly two weeks of
 * padding each side; weekly and monthly get progressively wider windows,
 * since a single weekly/monthly candle covers much more time and a tight
 * window would show almost nothing around the trade.
 */
const PADDING_DAYS: Record<BarInterval, number> = {
  d: 12,
  w: 56, // ~8 weeks
  m: 180, // ~6 months
};

export interface ReviewWindow {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD, never later than `today`
}

/**
 * The [from, to] date range to fetch bars for around a trade, given the
 * chosen chart interval. `today` is passed in (rather than read from
 * `Date.now()` inside) so this stays a pure, testable function - see
 * scripts/verify-trade-review-range.ts.
 */
export function reviewWindow(
  entryDate: string,
  exitDate: string | null,
  interval: BarInterval,
  today: string,
): ReviewWindow {
  const pad = PADDING_DAYS[interval];
  const from = addIsoDays(entryDate, -pad);
  const wanted = addIsoDays(exitDate ?? today, pad);
  const to = wanted > today ? today : wanted;
  return { from, to };
}
