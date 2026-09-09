import type { DailyClose } from "@/lib/quotes/stooq";

/**
 * "What actually happened around this trade" checks - not P&L math, but
 * simple after-the-fact observations meant to prompt a lesson: did the
 * stock keep running after you exited, did it touch your target before you
 * got out, did it recover after stopping you out. Pure function (fed
 * pre-fetched daily bars) so it's testable without network access - see
 * scripts/verify-post-trade-diagnosis.ts.
 */

export interface DiagnosisTradeInput {
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  /** ET calendar date (YYYY-MM-DD) the trade opened - see lib/time.ts easternParts. */
  entryDate: string;
  exitPrice: number;
  exitDate: string;
  plannedStop?: number | null;
  plannedTarget?: number | null;
}

export type FindingKind = "target_reachable_not_captured" | "continued_after_exit" | "recovered_after_stop";

export interface Finding {
  kind: FindingKind;
  message: string;
}

export interface TradeDiagnosis {
  symbol: string;
  findings: Finding[];
  /** Best price reached in the trade's favor during the trade itself (null if no bars covered that window). */
  bestDuringTrade: number | null;
  /** Best price reached in the trade's favor in the days after exit (null if no post-exit bars). */
  bestAfterExit: number | null;
}

/** How many calendar days after exit to look for continuation - roughly two trading weeks. */
const POST_EXIT_WINDOW_DAYS = 14;
/** Minimum extra favorable move after exit worth flagging, as a % of exit price. */
const CONTINUATION_THRESHOLD_PCT = 2;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Is `a` at least as favorable as `b` for this trade's direction? */
function atLeastAsFavorable(side: "long" | "short", a: number, b: number): boolean {
  return side === "long" ? a >= b : a <= b;
}

/** The extreme (high for long, low for short) price within [fromDate, toDate], inclusive. */
function bestFavorableExtreme(bars: DailyClose[], side: "long" | "short", fromDate: string, toDate: string): number | null {
  const inRange = bars.filter((b) => b.date >= fromDate && b.date <= toDate);
  if (inRange.length === 0) return null;
  const extremes = inRange.map((b) => (side === "long" ? b.high ?? b.close : b.low ?? b.close));
  return side === "long" ? Math.max(...extremes) : Math.min(...extremes);
}

export function diagnoseTrade(input: DiagnosisTradeInput, bars: DailyClose[]): TradeDiagnosis {
  // plannedStop isn't used by any check below yet (kept on the input type for
  // symmetry with plannedTarget / future checks - e.g. "stopped out well
  // before price even reached the stop" would need it).
  const { symbol, side, entryPrice, entryDate, exitPrice, exitDate, plannedTarget } = input;
  const findings: Finding[] = [];

  const bestDuringTrade = bestFavorableExtreme(bars, side, entryDate, exitDate);
  const postExitEnd = addDays(exitDate, POST_EXIT_WINDOW_DAYS);
  // Post-exit bars start the day after exit - exitDate's own bar is still "during the trade."
  const bestAfterExit = bestFavorableExtreme(bars, side, addDays(exitDate, 1), postExitEnd);

  if (
    plannedTarget != null &&
    bestDuringTrade != null &&
    atLeastAsFavorable(side, bestDuringTrade, plannedTarget) &&
    !atLeastAsFavorable(side, exitPrice, plannedTarget)
  ) {
    findings.push({
      kind: "target_reachable_not_captured",
      message: `${symbol} reached your planned target ($${plannedTarget.toFixed(2)}) while the trade was open (touched ~$${bestDuringTrade.toFixed(2)}), but the exit didn't capture it. A resting limit order at target - or extending it further, since it clearly had room - might have locked in more.`,
    });
  }

  if (bestAfterExit != null) {
    const extraMove = side === "long" ? bestAfterExit - exitPrice : exitPrice - bestAfterExit;
    const pct = (extraMove / Math.abs(exitPrice)) * 100;
    if (pct >= CONTINUATION_THRESHOLD_PCT) {
      findings.push({
        kind: "continued_after_exit",
        message: `In the ${POST_EXIT_WINDOW_DAYS} days after you exited, ${symbol} moved another ${pct.toFixed(1)}% in your favor (to ~$${bestAfterExit.toFixed(2)}). If you see this pattern often, a trailing stop or scaling out instead of a fixed exit may capture more of these moves.`,
      });
    }
  }

  const wasLoss = side === "long" ? exitPrice < entryPrice : exitPrice > entryPrice;
  if (wasLoss && bestAfterExit != null && atLeastAsFavorable(side, bestAfterExit, entryPrice)) {
    const alsoPastTarget = plannedTarget != null && atLeastAsFavorable(side, bestAfterExit, plannedTarget);
    findings.push({
      kind: "recovered_after_stop",
      message: `This trade closed at a loss, but ${symbol} later recovered back past your entry price ($${entryPrice.toFixed(2)})${alsoPastTarget ? " and even reached your original target" : ""} within ${POST_EXIT_WINDOW_DAYS} days. Your stop may have been tighter than this stock's normal swing - consider more room or a smaller position size next time instead.`,
    });
  }

  return { symbol, findings, bestDuringTrade, bestAfterExit };
}
