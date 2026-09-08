import Link from "next/link";
import { verifySession } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getQuote, unrealizedPnl } from "@/lib/quotes/finnhub";
import type { TradeRow } from "@/types/database";

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { style: "currency", currency: "USD" })}`;
}

async function unrealizedFor(trade: TradeRow): Promise<number | null> {
  // entry_price is only ever null for entryKnown=false trades, which are
  // always status='closed' (see lib/importers/colmex/group.ts) - so an
  // open trade always has a known entry price. Guarded anyway for safety.
  if (trade.entry_price == null) return null;
  const quote = await getQuote(trade.symbol);
  if (!quote) return null;
  return unrealizedPnl({
    side: trade.side,
    entryPrice: trade.entry_price,
    quantity: trade.quantity,
    currentPrice: quote.price,
  });
}

export default async function JournalPage() {
  const { userId } = await verifySession();
  const supabase = await createClient();
  const { data: trades } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .order("entry_time", { ascending: false });

  const rows = trades ?? [];
  const openTrades = rows.filter((t) => t.status === "open");
  const unrealizedEntries = await Promise.all(
    openTrades.map(async (t) => [t.id, await unrealizedFor(t)] as const),
  );
  const unrealizedById = new Map(unrealizedEntries);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Journal</h1>
        <div className="flex gap-2">
          <Link href="/import" className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
            Import CSV
          </Link>
          <Link href="/journal/new" className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900">
            + Add trade
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          <p>No trades yet.</p>
          <p className="mt-1 text-sm">
            <Link href="/import" className="underline">Import your Colmex Pro history</Link> or{" "}
            <Link href="/journal/new" className="underline">add your first trade</Link>.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-zinc-100 text-left text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Side</th>
                <th className="px-3 py-2 font-medium">Entry</th>
                <th className="px-3 py-2 font-medium">Exit</th>
                <th className="px-3 py-2 font-medium">P&amp;L</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Strategy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const isOpen = t.status === "open";
                const displayPnl = isOpen ? unrealizedById.get(t.id) ?? null : t.pnl;
                return (
                  <tr key={t.id} className="border-t border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
                    <td className="px-3 py-2">
                      <Link href={`/journal/${t.id}`} className="font-medium underline-offset-2 hover:underline">
                        {t.symbol}
                      </Link>
                    </td>
                    <td className="px-3 py-2 capitalize">{t.side}</td>
                    <td className="px-3 py-2">{new Date(t.entry_time).toLocaleDateString()}</td>
                    <td className="px-3 py-2">{t.exit_time ? new Date(t.exit_time).toLocaleDateString() : "—"}</td>
                    <td className={`px-3 py-2 font-medium ${displayPnl != null && displayPnl > 0 ? "text-emerald-600" : displayPnl != null && displayPnl < 0 ? "text-red-600" : ""}`}>
                      {formatMoney(displayPnl)}
                      {isOpen && displayPnl != null && <span className="ml-1 text-xs text-zinc-400">(unrealized)</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${isOpen ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-500">{t.strategy_tag ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
