"use server";

import { verifySession } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getHistoricalCloses } from "@/lib/quotes/stooq";
import { diagnoseTrade, type Finding } from "@/lib/analytics/postTradeDiagnosis";
import { easternParts, addIsoDays } from "@/lib/time";
import type { TradeRow } from "@/types/database";

export interface TradeDiagnosisResult {
  tradeId: string;
  symbol: string;
  findings: Finding[];
  /** Set instead of findings when the trade couldn't be diagnosed at all (still open, or no price history available). */
  skippedReason?: string;
  /**
   * Whether diagnoseTrade actually ran (bars were available, plan was set).
   * Only completed results are persisted (diagnosis_generated_at) - a
   * structural skip (still open, no plan set, no price history yet) can
   * become diagnosable later, so it must be free to retry next time rather
   * than being permanently marked "generated" with nothing behind it.
   */
  completed: boolean;
}

const POST_EXIT_WINDOW_DAYS = 30; // must match lib/analytics/postTradeDiagnosis.ts
/** How long after a trade closes before its review is auto-surfaced in the Journal - see TradeReviewsPanel. Same window the diagnosis itself looks forward, so by the time it's shown the "what happened next" data already exists. */
const REVIEW_MATURITY_DAYS = POST_EXIT_WINDOW_DAYS;

type DiagnosableTrade = Pick<
  TradeRow,
  "id" | "symbol" | "side" | "status" | "entry_price" | "entry_time" | "exit_price" | "exit_time" | "planned_stop" | "planned_target"
>;

/**
 * Runs lib/analytics/postTradeDiagnosis.ts for one trade (best-effort - a
 * trade that's still open, has no risk plan, or whose symbol has no
 * available price history is reported back as skipped rather than failing).
 * Shared by the on-demand "Diagnose selected" bulk action and the
 * auto-surfaced monthly review, so both paths compute the same way and
 * agree on what "skipped" means.
 */
async function diagnoseOne(t: DiagnosableTrade): Promise<TradeDiagnosisResult> {
  if (t.status !== "closed" || t.exit_price == null || t.exit_time == null || t.entry_price == null) {
    return { tradeId: t.id, symbol: t.symbol, findings: [], completed: false, skippedReason: "Trade is still open (or entry unknown) - nothing to diagnose yet." };
  }
  // These checks only mean something relative to a plan the trade actually
  // had - a trade with no stop/target set has nothing to have deviated
  // from, so it's skipped rather than guessed at.
  if (t.planned_stop == null || t.planned_target == null) {
    return { tradeId: t.id, symbol: t.symbol, findings: [], completed: false, skippedReason: "No stop/target was set for this trade - nothing to compare it against." };
  }

  const entryDate = easternParts(new Date(t.entry_time)).isoDate;
  const exitDate = easternParts(new Date(t.exit_time)).isoDate;
  const from = new Date(`${entryDate}T00:00:00Z`);
  const to = new Date(`${addIsoDays(exitDate, POST_EXIT_WINDOW_DAYS)}T00:00:00Z`);

  const bars = await getHistoricalCloses(t.symbol, from, to);
  if (!bars) {
    return { tradeId: t.id, symbol: t.symbol, findings: [], completed: false, skippedReason: "No price history available for this symbol right now." };
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

  return {
    tradeId: t.id,
    symbol: t.symbol,
    findings: diagnosis.findings,
    completed: true,
    skippedReason: diagnosis.findings.length === 0 ? "Nothing notable found." : undefined,
  };
}

/**
 * "Diagnose" a set of already-closed trades on demand (the Journal's
 * "Diagnose selected" bulk action). Persists each result onto the trade row
 * (diagnosis / diagnosis_generated_at) so it doesn't need recomputing -
 * including by the auto-surfaced review in getMaturedReviews below, which
 * skips trades that already have one.
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

  const results = await Promise.all(trades.map(diagnoseOne));

  await Promise.all(
    results
      .filter((r) => r.completed)
      .map((r) =>
        supabase
          .from("trades")
          .update({ diagnosis: r.findings, diagnosis_generated_at: new Date().toISOString() })
          .eq("id", r.tradeId)
          .eq("user_id", userId),
      ),
  );

  return results;
}

export interface MaturedReview {
  trade: TradeRow;
  findings: Finding[];
}

/**
 * The auto-surfaced counterpart to diagnoseTrades: finds trades that closed
 * with a full risk plan at least REVIEW_MATURITY_DAYS ago and don't have a
 * diagnosis yet, generates and persists one for each, then returns every
 * trade with an unviewed diagnosis (freshly generated or from an earlier
 * visit) for the Journal page's TradeReviewsPanel to show. In-app only -
 * there's no background job here, generation happens lazily on whichever
 * page load first notices a trade has matured.
 */
export async function getMaturedReviews(): Promise<MaturedReview[]> {
  const { userId } = await verifySession();
  const supabase = await createClient();

  const maturityCutoff = new Date();
  maturityCutoff.setUTCDate(maturityCutoff.getUTCDate() - REVIEW_MATURITY_DAYS);

  const { data: pending } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "closed")
    .not("planned_stop", "is", null)
    .not("planned_target", "is", null)
    .is("diagnosis_generated_at", null)
    .lte("exit_time", maturityCutoff.toISOString());

  if (pending && pending.length > 0) {
    const results = await Promise.all(pending.map(diagnoseOne));
    // Trades this query selected are already closed with a plan set, so the
    // only way `completed` is false here is "no price history right now" -
    // left un-persisted on purpose, so it's retried on a future visit
    // instead of being silently stuck unreviewed forever.
    await Promise.all(
      results
        .filter((r) => r.completed)
        .map((r) =>
          supabase
            .from("trades")
            .update({ diagnosis: r.findings, diagnosis_generated_at: new Date().toISOString() })
            .eq("id", r.tradeId)
            .eq("user_id", userId),
        ),
    );
  }

  const { data: unviewed } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .not("diagnosis_generated_at", "is", null)
    .is("diagnosis_viewed_at", null)
    .order("exit_time", { ascending: false });

  return (unviewed ?? [])
    .map((trade) => ({ trade, findings: (trade.diagnosis as Finding[] | null) ?? [] }))
    .filter((r) => r.findings.length > 0); // "nothing notable found" trades are generated but never worth surfacing unprompted
}

/** Marks one or more matured reviews as seen, so they stop reappearing on the Journal page. */
export async function markReviewsViewed(tradeIds: string[]): Promise<void> {
  const { userId } = await verifySession();
  if (tradeIds.length === 0) return;
  const supabase = await createClient();
  await supabase
    .from("trades")
    .update({ diagnosis_viewed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("id", tradeIds);
}
