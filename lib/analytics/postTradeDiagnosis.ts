import type { DailyClose } from "@/lib/quotes/stooq";

/**
 * "What actually happened around this trade" checks - not P&L math, but
 * simple after-the-fact observations meant to prompt a lesson: did the
 * stock keep running after you exited, did it touch your target before you
 * got out, did it recover after stopping you out, and - the main one -
 * would your own stop or target have been hit first if you'd just left the
 * trade alone. Pure function (fed pre-fetched daily bars) so it's testable
 * without network access - see scripts/verify-post-trade-diagnosis.ts.
 *
 * Deliberately scoped to trades that had BOTH a planned stop and a planned
 * target set from the start: a "mistake" only means something relative to
 * a plan that existed. A trade with no plan has nothing to have deviated
 * from, so callers should skip it before reaching this function (see
 * app/actions/diagnostics.ts) rather than this module guessing at intent.
 *
 * Tuned for swing trades (holds of days to weeks), not intraday day
 * trading - daily bars are the right resolution, and the lookforward
 * window below is measured in weeks.
 */

export interface DiagnosisTradeInput {
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  /** ET calendar date (YYYY-MM-DD) the trade opened - see lib/time.ts easternParts. */
  entryDate: string;
  exitPrice: number;
  exitDate: string;
  plannedStop: number;
  plannedTarget: number;
}

export type FindingKind =
  | "target_reachable_not_captured"
  | "continued_after_exit"
  | "recovered_after_stop"
  | "premature_exit_missed_target"
  | "premature_exit_dodged_stop"
  | "premature_exit_ambiguous";

export interface Finding {
  kind: FindingKind;
  message: string;
}

export interface TradeDiagnosis {
  symbol: string;
  findings: Finding[];
  /** Best price reached in the trade's favor during the trade itself (null if no bars covered that window). */
  bestDuringTrade: number | null;
  /** Best price reached in the trade's favor in the weeks after exit (null if no post-exit bars). */
  bestAfterExit: number | null;
}

/** How many calendar days after exit to look for continuation/resolution - roughly a month, sized for swing-trade holding periods rather than day-trading. */
const POST_EXIT_WINDOW_DAYS = 30;
/** Minimum extra favorable move after exit worth flagging, as a % of exit price. */
const CONTINUATION_THRESHOLD_PCT = 2;
/** How close to a planned level counts as "the plan actually triggered this exit," not a manual bail - covers broker slippage on stop/limit fills. */
const AT_LEVEL_TOLERANCE_PCT = 0.5;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Is `a` at least as favorable as `b` for this trade's direction? */
function atLeastAsFavorable(side: "long" | "short", a: number, b: number): boolean {
  return side === "long" ? a >= b : a <= b;
}

function nearLevel(price: number, level: number): boolean {
  return Math.abs(price - level) / Math.abs(level) * 100 <= AT_LEVEL_TOLERANCE_PCT;
}

/** The extreme (high for long, low for short) price within [fromDate, toDate], inclusive. */
function bestFavorableExtreme(bars: DailyClose[], side: "long" | "short", fromDate: string, toDate: string): number | null {
  const inRange = bars.filter((b) => b.date >= fromDate && b.date <= toDate);
  if (inRange.length === 0) return null;
  const extremes = inRange.map((b) => (side === "long" ? b.high ?? b.close : b.low ?? b.close));
  return side === "long" ? Math.max(...extremes) : Math.min(...extremes);
}

/** Did this bar's range reach `level`, approaching from the given direction? */
function barReached(bar: DailyClose, level: number, direction: "up" | "down"): boolean {
  return direction === "up" ? (bar.high ?? bar.close) >= level : (bar.low ?? bar.close) <= level;
}

/**
 * Simulates leaving the trade alone after (premature) exit: scanning
 * forward day by day, which planned level - target or stop - does price
 * reach first? Returns null if neither is reached within the window, or
 * "ambiguous" if both fall inside the same day's range (daily bars can't
 * say which happened first intraday).
 */
function raceToLevels(
  bars: DailyClose[],
  side: "long" | "short",
  fromDateExclusive: string,
  toDate: string,
  target: number,
  stop: number,
): "target" | "stop" | "ambiguous" | null {
  const targetDir = side === "long" ? "up" : "down";
  const stopDir = side === "long" ? "down" : "up";
  const sorted = bars
    .filter((b) => b.date > fromDateExclusive && b.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const bar of sorted) {
    const hitTarget = barReached(bar, target, targetDir);
    const hitStop = barReached(bar, stop, stopDir);
    if (hitTarget && hitStop) return "ambiguous";
    if (hitTarget) return "target";
    if (hitStop) return "stop";
  }
  return null;
}

export function diagnoseTrade(input: DiagnosisTradeInput, bars: DailyClose[]): TradeDiagnosis {
  const { symbol, side, entryPrice, entryDate, exitPrice, exitDate, plannedStop, plannedTarget } = input;
  const findings: Finding[] = [];

  const bestDuringTrade = bestFavorableExtreme(bars, side, entryDate, exitDate);
  const postExitEnd = addDays(exitDate, POST_EXIT_WINDOW_DAYS);
  // Post-exit bars start the day after exit - exitDate's own bar is still "during the trade."
  const bestAfterExit = bestFavorableExtreme(bars, side, addDays(exitDate, 1), postExitEnd);

  if (
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
    const alsoPastTarget = atLeastAsFavorable(side, bestAfterExit, plannedTarget);
    findings.push({
      kind: "recovered_after_stop",
      message: `This trade closed at a loss, but ${symbol} later recovered back past your entry price ($${entryPrice.toFixed(2)})${alsoPastTarget ? " and even reached your original target" : ""} within ${POST_EXIT_WINDOW_DAYS} days. Your stop may have been tighter than this stock's normal swing - consider more room or a smaller position size next time instead.`,
    });
  }

  // The main check: did you exit on your own, before either your stop or
  // your target was actually hit? Only meaningful when the exit wasn't
  // itself (approximately) the stop or target order filling.
  const exitWasAtTarget = nearLevel(exitPrice, plannedTarget);
  const exitWasAtStop = nearLevel(exitPrice, plannedStop);
  const exitWasBetweenLevels = !atLeastAsFavorable(side, exitPrice, plannedTarget) && !exitWasAtTarget && !exitWasAtStop;

  if (exitWasBetweenLevels) {
    const verdict = raceToLevels(bars, side, exitDate, postExitEnd, plannedTarget, plannedStop);
    if (verdict === "target") {
      findings.push({
        kind: "premature_exit_missed_target",
        message: `You exited ${symbol} manually at $${exitPrice.toFixed(2)}, before either your stop ($${plannedStop.toFixed(2)}) or target ($${plannedTarget.toFixed(2)}) was hit. Price went on to reach your target within ${POST_EXIT_WINDOW_DAYS} days - if you'd stuck to the plan, this trade would have played out as planned. Worth asking what made you exit early.`,
      });
    } else if (verdict === "stop") {
      findings.push({
        kind: "premature_exit_dodged_stop",
        message: `You exited ${symbol} manually at $${exitPrice.toFixed(2)}, before either your stop ($${plannedStop.toFixed(2)}) or target ($${plannedTarget.toFixed(2)}) was hit. Price went on to hit your stop within ${POST_EXIT_WINDOW_DAYS} days - your early exit avoided a bigger loss this time. Still worth examining why you doubted the plan, since that won't always be the outcome.`,
      });
    } else if (verdict === "ambiguous") {
      findings.push({
        kind: "premature_exit_ambiguous",
        message: `You exited ${symbol} manually at $${exitPrice.toFixed(2)}, before either level was hit. Both your stop and target fell within the same day's range shortly after - daily data can't tell which would have happened first, but it's worth pulling up an intraday chart around that date if you want to know.`,
      });
    }
    // verdict === null: neither level resolved within the window - genuinely inconclusive, no finding.
  }

  return { symbol, findings, bestDuringTrade, bestAfterExit };
}
