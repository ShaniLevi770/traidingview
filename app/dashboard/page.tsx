import { verifySession } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import {
  winRate,
  profitFactor,
  averageWinLoss,
  averageR,
  ruleAdherenceSplit,
  pnlBySymbol,
  pnlByStrategyTag,
  currentStreak,
  totalPnl,
  equityCurve,
} from "@/lib/analytics/metrics";
import { EquityCurveChart } from "@/components/EquityCurveChart";

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { style: "currency", currency: "USD" })}`;
}
function formatPct(n: number | null): string {
  return n == null ? "—" : `${(n * 100).toFixed(0)}%`;
}
function formatStreak(streak: number): string {
  if (streak === 0) return "—";
  const count = Math.abs(streak);
  const noun = streak > 0 ? (count > 1 ? "wins" : "win") : count > 1 ? "losses" : "loss";
  return `${count} ${noun}`;
}

export default async function DashboardPage() {
  const { userId } = await verifySession();
  const supabase = await createClient();
  const { data } = await supabase.from("trades").select("*").eq("user_id", userId);
  const trades = data ?? [];

  const adherence = ruleAdherenceSplit(trades);
  const streak = currentStreak(trades);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total P&L" value={formatMoney(totalPnl(trades))} />
        <Stat label="Win rate" value={formatPct(winRate(trades))} />
        <Stat label="Profit factor" value={profitFactor(trades)?.toFixed(2) ?? "—"} />
        <Stat label="Avg R" value={averageR(trades) != null ? `${averageR(trades)!.toFixed(2)}R` : "—"} />
        <Stat label="Avg win" value={formatMoney(averageWinLoss(trades).avgWin)} />
        <Stat label="Avg loss" value={formatMoney(averageWinLoss(trades).avgLoss)} />
        <Stat label="Current streak" value={formatStreak(streak)} />
        <Stat label="Closed trades" value={String(trades.filter((t) => t.status === "closed").length)} />
        <Stat label="Open trades" value={String(trades.filter((t) => t.status === "open").length)} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Equity curve</h2>
        <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
          <EquityCurveChart data={equityCurve(trades)} />
        </div>
      </section>

      {(adherence.followed.count > 0 || adherence.notFollowed.count > 0) && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Following your plan vs. not
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">Followed plan ({adherence.followed.count})</p>
              <p className="text-lg font-medium">{formatPct(adherence.followed.winRate)} win rate</p>
              <p className="text-sm text-zinc-500">{formatMoney(adherence.followed.avgPnl)} avg P&amp;L</p>
            </div>
            <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">Didn&apos;t follow plan ({adherence.notFollowed.count})</p>
              <p className="text-lg font-medium">{formatPct(adherence.notFollowed.winRate)} win rate</p>
              <p className="text-sm text-zinc-500">{formatMoney(adherence.notFollowed.avgPnl)} avg P&amp;L</p>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <BreakdownTable title="P&L by symbol" rows={pnlBySymbol(trades)} />
        <BreakdownTable title="P&L by strategy" rows={pnlByStrategyTag(trades)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-medium">{value}</p>
    </div>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: { key: string; totalPnl: number; count: number; avgPnl: number }[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No data yet.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-zinc-200 first:border-t-0 dark:border-zinc-800">
                  <td className="px-3 py-2 font-medium">{r.key}</td>
                  <td className="px-3 py-2 text-zinc-500">{r.count} trade{r.count > 1 ? "s" : ""}</td>
                  <td className={`px-3 py-2 text-right font-medium ${r.totalPnl > 0 ? "text-emerald-600" : r.totalPnl < 0 ? "text-red-600" : ""}`}>
                    {r.totalPnl > 0 ? "+" : ""}{r.totalPnl.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
