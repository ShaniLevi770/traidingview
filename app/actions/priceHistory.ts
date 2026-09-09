"use server";

import { verifySession } from "@/lib/supabase/dal";
import { getHistoricalCloses, type BarInterval, type DailyClose } from "@/lib/quotes/stooq";
import { reviewWindow } from "@/lib/analytics/tradeReviewRange";
import { easternParts } from "@/lib/time";

export type { BarInterval };
export interface ChartBar {
  date: string;
  close: number;
  high?: number;
  low?: number;
}

/**
 * Bars for the trade review chart on a trade's detail page - daily,
 * weekly, or monthly, spanning a window around the trade (see
 * lib/analytics/tradeReviewRange.ts) so the user can see the setup and
 * what happened after, with their planned stop/target drawn over real
 * price action.
 */
export async function getTradeReviewBars(
  symbol: string,
  entryTimeIso: string,
  exitTimeIso: string | null,
  interval: BarInterval,
): Promise<ChartBar[] | null> {
  await verifySession();

  const entryDate = easternParts(new Date(entryTimeIso)).isoDate;
  const exitDate = exitTimeIso ? easternParts(new Date(exitTimeIso)).isoDate : null;
  const today = easternParts(new Date()).isoDate;

  const { from, to } = reviewWindow(entryDate, exitDate, interval, today);
  const bars: DailyClose[] | null = await getHistoricalCloses(symbol, new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`), interval);
  return bars;
}
