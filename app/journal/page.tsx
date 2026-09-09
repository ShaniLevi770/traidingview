import Link from "next/link";
import { verifySession } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getQuote, unrealizedPnl } from "@/lib/quotes/finnhub";
import { getMaturedReviews } from "@/app/actions/diagnostics";
import { JournalTable } from "@/components/JournalTable";
import { TradeReviewsPanel } from "@/components/TradeReviewsPanel";
import type { TradeRow } from "@/types/database";

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
  const unrealizedById = Object.fromEntries(unrealizedEntries);
  // Best-effort: a matured trade whose Stooq lookup fails just stays pending
  // and is retried on a future visit (see getMaturedReviews) rather than
  // blocking the page.
  const maturedReviews = await getMaturedReviews();

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

      <TradeReviewsPanel reviews={maturedReviews} />

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          <p>No trades yet.</p>
          <p className="mt-1 text-sm">
            <Link href="/import" className="underline">Import your Colmex Pro history</Link> or{" "}
            <Link href="/journal/new" className="underline">add your first trade</Link>.
          </p>
        </div>
      ) : (
        <JournalTable rows={rows} unrealizedById={unrealizedById} />
      )}
    </div>
  );
}
