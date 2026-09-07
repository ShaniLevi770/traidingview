import type { TradeRow } from "@/types/database";

/**
 * Pure, framework/DB-free functions over trade rows. Deliberately isolated
 * from UI and Supabase-client code (see plan: "analytics/insights logic
 * lives in its own isolated module") so a future Python service can take
 * over the more advanced (ML-driven) analysis later without this module,
 * the pages that call it, or the schema needing to change - it would just
 * read the same `trades` table and expose comparable numbers over an API.
 */

const closedWithPnl = (trades: TradeRow[]) =>
  trades.filter((t) => t.status === "closed" && t.pnl != null) as (TradeRow & { pnl: number })[];

export function winRate(trades: TradeRow[]): number | null {
  const closed = closedWithPnl(trades);
  if (closed.length === 0) return null;
  return closed.filter((t) => t.pnl > 0).length / closed.length;
}

export function profitFactor(trades: TradeRow[]): number | null {
  const closed = closedWithPnl(trades);
  const grossWin = closed.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = closed.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0);
  if (grossLoss === 0) return grossWin > 0 ? Infinity : null;
  return grossWin / Math.abs(grossLoss);
}

export function averageWinLoss(trades: TradeRow[]): { avgWin: number | null; avgLoss: number | null } {
  const closed = closedWithPnl(trades);
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  return {
    avgWin: wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : null,
    avgLoss: losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : null,
  };
}

export interface EquityPoint {
  date: string; // ISO date of the trade's exit
  pnl: number; // this trade's pnl
  cumulativePnl: number;
}

export function equityCurve(trades: TradeRow[]): EquityPoint[] {
  const closed = closedWithPnl(trades)
    .filter((t) => t.exit_time)
    .sort((a, b) => new Date(a.exit_time!).getTime() - new Date(b.exit_time!).getTime());

  let running = 0;
  return closed.map((t) => {
    running += t.pnl;
    return { date: t.exit_time!, pnl: t.pnl, cumulativePnl: running };
  });
}

/** Dollar amount at risk on a trade, from its planned stop - null if no stop (or no known entry price) was recorded. */
export function moneyAtRisk(trade: TradeRow): number | null {
  if (trade.planned_stop == null || trade.entry_price == null) return null;
  return Math.abs(trade.entry_price - trade.planned_stop) * trade.quantity;
}

/** Planned reward:risk ratio - null if stop, target, or entry price wasn't recorded. */
export function plannedRR(trade: TradeRow): number | null {
  if (trade.planned_stop == null || trade.planned_target == null || trade.entry_price == null) return null;
  const risk = Math.abs(trade.entry_price - trade.planned_stop);
  if (risk === 0) return null;
  return Math.abs(trade.planned_target - trade.entry_price) / risk;
}

/** Actual result expressed in multiples of the planned risk - null if pnl or planned stop is missing. */
export function actualR(trade: TradeRow): number | null {
  const risk = moneyAtRisk(trade);
  if (risk == null || risk === 0 || trade.pnl == null) return null;
  return trade.pnl / risk;
}

export function averageR(trades: TradeRow[]): number | null {
  const rs = closedWithPnl(trades).map(actualR).filter((r): r is number => r != null);
  if (rs.length === 0) return null;
  return rs.reduce((s, r) => s + r, 0) / rs.length;
}

export interface RuleAdherenceSplit {
  followed: { count: number; winRate: number | null; avgPnl: number | null };
  notFollowed: { count: number; winRate: number | null; avgPnl: number | null };
}

/** The core plan-vs-actual insight: does honoring the trade plan actually correlate with better outcomes for this user? */
export function ruleAdherenceSplit(trades: TradeRow[]): RuleAdherenceSplit {
  const closed = closedWithPnl(trades).filter((t) => t.followed_plan != null);
  const summarize = (group: (TradeRow & { pnl: number })[]) => ({
    count: group.length,
    winRate: group.length ? group.filter((t) => t.pnl > 0).length / group.length : null,
    avgPnl: group.length ? group.reduce((s, t) => s + t.pnl, 0) / group.length : null,
  });
  return {
    followed: summarize(closed.filter((t) => t.followed_plan === true)),
    notFollowed: summarize(closed.filter((t) => t.followed_plan === false)),
  };
}

export interface GroupedPnl {
  key: string;
  totalPnl: number;
  count: number;
  avgPnl: number;
}

function groupBy(trades: TradeRow[], key: (t: TradeRow) => string | null): GroupedPnl[] {
  const closed = closedWithPnl(trades);
  const groups = new Map<string, number[]>();
  for (const t of closed) {
    const k = key(t);
    if (!k) continue;
    const list = groups.get(k) ?? [];
    list.push(t.pnl);
    groups.set(k, list);
  }
  return [...groups.entries()]
    .map(([k, pnls]) => ({
      key: k,
      totalPnl: pnls.reduce((s, p) => s + p, 0),
      count: pnls.length,
      avgPnl: pnls.reduce((s, p) => s + p, 0) / pnls.length,
    }))
    .sort((a, b) => b.totalPnl - a.totalPnl);
}

export const pnlBySymbol = (trades: TradeRow[]) => groupBy(trades, (t) => t.symbol);
export const pnlByStrategyTag = (trades: TradeRow[]) => groupBy(trades, (t) => t.strategy_tag);
export const pnlByMistakeTag = (trades: TradeRow[]) =>
  groupBy(
    trades.flatMap((t) => t.mistake_tags.map((tag) => ({ ...t, __tag: tag }))),
    (t) => (t as TradeRow & { __tag: string }).__tag,
  );

/** Current win/loss streak, most-recent trade first. Positive = winning streak, negative = losing streak. */
export function currentStreak(trades: TradeRow[]): number {
  const closed = closedWithPnl(trades)
    .filter((t) => t.exit_time)
    .sort((a, b) => new Date(b.exit_time!).getTime() - new Date(a.exit_time!).getTime());

  if (closed.length === 0) return 0;
  const sign = closed[0].pnl > 0 ? 1 : closed[0].pnl < 0 ? -1 : 0;
  if (sign === 0) return 0;

  let streak = 0;
  for (const t of closed) {
    const s = t.pnl > 0 ? 1 : t.pnl < 0 ? -1 : 0;
    if (s !== sign) break;
    streak += sign;
  }
  return streak;
}

export function totalPnl(trades: TradeRow[]): number {
  return closedWithPnl(trades).reduce((s, t) => s + t.pnl, 0);
}
