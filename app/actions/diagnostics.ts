"use server";

import { verifySession } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getHistoricalCloses } from "@/lib/quotes/stooq";
import { diagnoseTrade, type Finding } from "@/lib/analytics/postTradeDiagnosis";
import { easternParts } from "@/lib/time";

export interface TradeDiagnosisResult {
  tradeId: string;
  symbol: string;
  findings: Finding[];
  /** Set instead of findings when the trade couldn't be diagnosed at all (still open, or no price history available). */
  skippedReason?: string;
}

const POST_EXIT_WINDOW_DAYS = 30; // must match lib/analytics/postTradeDiagnosis.ts

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * "Diagnose" a set of already-closed trades: for each, pulls daily price
 * history spanning the trade plus ~a month after exit (sized for swing
 * trades, not day trading), and checks for simple after-the-fact lessons -
 * see lib/analytics/postTradeDiagnosis.ts for the actual checks, including
 * the main one: if you exited manually before either your stop or target
 * was hit, which one would have happened first had you stayed in. Only
 * runs on trades that had both a planned stop and target set - a "mistake"
 * only means something relative to a plan that existed. Best-effort: a
 * trade that's still open, has no plan, or whose symbol has no available
 * price history, is reported back as skipped rather than failing the whole
 * batch.
 */
export async function diagnoseTrades(tradeIds: string[]): Promise<TradeDiagnosisResult[]> {
  const { userId } = await verifySession();
  if (tradeIds.length === 0) return [];

  const supabase = await createClient();
  const { data: trades, error } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .in("id", tradeIds);

  if (error || !trades) return [];

  const results: TradeDiagnosisResult[] = [];

  for (const t of trades) {
    if (t.status !== "closed" || t.exit_price == null || t.exit_time == null || t.entry_price == null) {
      results.push({ tradeId: t.id, symbol: t.symbol, findings: [], skippedReason: "Trade is still open (or entry unknown) - nothing to diagnose yet." });
      continue;
    }
    // These checks only mean something relative to a plan the trade actually
    // had - a trade with no stop/target set has nothing to have deviated
    // from, so it's skipped rather than guessed at.
    if (t.planned_stop == null || t.planned_target == null) {
      results.push({ tradeId: t.id, symbol: t.symbol, findings: [], skippedReason: "No stop/target was set for this trade - nothing to compare it against." });
      continue;
    }

    const entryDate = easternParts(new Date(t.entry_time)).isoDate;
    const exitDate = easternParts(new Date(t.exit_time)).isoDate;
    const from = new Date(`${entryDate}T00:00:00Z`);
    const to = new Date(`${addDays(exitDate, POST_EXIT_WINDOW_DAYS)}T00:00:00Z`);

    const bars = await getHistoricalCloses(t.symbol, from, to);
    if (!bars) {
      results.push({ tradeId: t.id, symbol: t.symbol, findings: [], skippedReason: "No price history available for this symbol right now." });
      continue;
    }

    const diagnosis = diagnoseTrade(
      {
        symbol: t.symbol,
        side: t.side,
        entryPrice: t.entry_price,
        entryDate,
        exitPrice: t.exit_price,
        exitDate,
        plannedStop: t.planned_stop,
        plannedTarget: t.planned_target,
      },
      bars,
    );

    results.push({
      tradeId: t.id,
      symbol: t.symbol,
      findings: diagnosis.findings,
      skippedReason: diagnosis.findings.length === 0 ? "Nothing notable found." : undefined,
    });
  }

  return results;
}
