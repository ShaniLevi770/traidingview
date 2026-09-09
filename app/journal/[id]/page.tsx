import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { verifySession } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getSignedScreenshotUrl } from "@/lib/supabase/storage";
import { getQuote, unrealizedPnl } from "@/lib/quotes/finnhub";
import { moneyAtRisk, plannedRR, actualR } from "@/lib/analytics/metrics";
import type { Finding } from "@/lib/analytics/postTradeDiagnosis";
import { TradingViewWidget } from "@/components/TradingViewWidget";
import { TradeReviewChart } from "@/components/TradeReviewChart";
import { findingLabel } from "@/components/findingLabels";

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { style: "currency", currency: "USD" })}`;
}

export default async function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await verifySession();
  const supabase = await createClient();

  const { data: trade } = await supabase.from("trades").select("*").eq("id", id).eq("user_id", userId).single();
  if (!trade) notFound();

  const screenshotUrl = trade.screenshot_url ? await getSignedScreenshotUrl(trade.screenshot_url) : null;

  let displayPnl = trade.pnl;
  let pnlLabel = "P&L";
  if (trade.status === "open" && trade.entry_price != null) {
    const quote = await getQuote(trade.symbol);
    displayPnl = quote
      ? unrealizedPnl({ side: trade.side, entryPrice: trade.entry_price, quantity: trade.quantity, currentPrice: quote.price })
      : null;
    pnlLabel = quote ? `Unrealized P&L (as of ${new Date(quote.asOf).toLocaleTimeString()})` : "Unrealized P&L (quote unavailable)";
  }

  const risk = moneyAtRisk(trade);
  const rr = plannedRR(trade);
  const r = trade.status === "closed" ? actualR(trade) : null;

  return (
    <div className="w-full">
      <div className="mx-auto flex w-full max-w-6xl items-start justify-between px-4 pt-8">
        <div>
          <h1 className="text-2xl font-semibold">
            {trade.symbol} <span className="font-normal capitalize text-zinc-500">· {trade.side}</span>
          </h1>
          <p className="text-sm text-zinc-500">
            {new Date(trade.entry_time).toLocaleString()}
            {trade.exit_time && ` → ${new Date(trade.exit_time).toLocaleString()}`}
          </p>
        </div>
        <Link href={`/journal/${trade.id}/edit`} className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
          Edit
        </Link>
      </div>

      {/* Full viewport width, not capped by the page's reading-width container - a chart
          this dense (months of daily candles) needs every pixel it can get, and the fixed
          max-w column was making it cramped/unreadable regardless of screen size. */}
      <div className="my-6 border-y border-zinc-200 dark:border-zinc-800">
        <TradingViewWidget symbol={trade.symbol} entryTime={trade.entry_time} exitTime={trade.exit_time} />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-8">
      {!trade.entry_known && (
        <p className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          This trade&apos;s opening fill wasn&apos;t in the imported file (partial export) — entry price/date are
          unknown, but the exit and P&amp;L are Colmex&apos;s own reported figures.
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={pnlLabel} value={formatMoney(displayPnl)} tone={displayPnl} />
        <Stat label="Entry / Exit" value={`${trade.entry_price ?? "unknown"} → ${trade.exit_price ?? "open"}`} />
        <Stat label="Quantity" value={String(trade.quantity)} />
        <Stat label="Fees" value={formatMoney(-trade.fees)} />
      </div>

      {(trade.planned_stop != null || trade.planned_target != null) && (
        <div className="mb-6 rounded border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Risk plan</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Planned stop" value={trade.planned_stop != null ? String(trade.planned_stop) : "—"} />
            <Stat label="Planned target" value={trade.planned_target != null ? String(trade.planned_target) : "—"} />
            <Stat label="$ at risk" value={risk != null ? formatMoney(risk) : "—"} />
            <Stat label="Planned R:R" value={rr != null ? `${rr.toFixed(2)}R` : "—"} />
          </div>
          {r != null && (
            <p className="mt-3 text-sm">
              Actual result: <span className="font-medium">{r.toFixed(2)}R</span>{" "}
              <span className="text-zinc-500">(P&amp;L ÷ $ at risk)</span>
            </p>
          )}
          {trade.expected_duration && (
            <p className="mt-1 text-sm text-zinc-500">Expected to take: {trade.expected_duration}</p>
          )}
        </div>
      )}

      {trade.entry_known && trade.entry_price != null && (
        <div className="mb-6 rounded border border-zinc-200 p-4 dark:border-zinc-800">
          <TradeReviewChart
            symbol={trade.symbol}
            entryTime={trade.entry_time}
            exitTime={trade.exit_time}
            entryPrice={trade.entry_price}
            exitPrice={trade.exit_price}
            plannedStop={trade.planned_stop}
            plannedTarget={trade.planned_target}
          />
        </div>
      )}

      {trade.followed_plan != null && (
        <p className="mb-6 text-sm">
          Followed my plan: <span className="font-medium">{trade.followed_plan ? "Yes" : "No"}</span>
        </p>
      )}

      {trade.mistake_tags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {trade.mistake_tags.map((tag) => (
            <span key={tag} className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-400">
              {tag}
            </span>
          ))}
        </div>
      )}

      {(trade.thesis || trade.exit_reason) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          {trade.thesis && (
            <div>
              <h2 className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Why I entered</h2>
              <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{trade.thesis}</p>
            </div>
          )}
          {trade.exit_reason && (
            <div>
              <h2 className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Why I exited</h2>
              <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{trade.exit_reason}</p>
            </div>
          )}
        </div>
      )}

      {trade.diagnosis != null && (trade.diagnosis as Finding[]).length > 0 && (
        <div className="mb-6 rounded border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Review</h2>
          <ul className="list-inside list-disc space-y-1">
            {(trade.diagnosis as Finding[]).map((f, i) => (
              <li key={i} className="text-sm text-zinc-600 dark:text-zinc-300">
                <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                  {findingLabel[f.kind]}
                </span>
                {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {trade.notes && (
        <div className="mb-6">
          <h2 className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{trade.notes}</p>
        </div>
      )}

      {screenshotUrl && (
        <div className="mb-6">
          <h2 className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Screenshot</h2>
          <Image src={screenshotUrl} alt={`${trade.symbol} trade screenshot`} width={800} height={500} className="rounded border border-zinc-200 dark:border-zinc-800" unoptimized />
        </div>
      )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  const toneClass = tone != null && tone > 0 ? "text-emerald-600" : tone != null && tone < 0 ? "text-red-600" : "";
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-medium ${toneClass}`}>{value}</p>
    </div>
  );
}
