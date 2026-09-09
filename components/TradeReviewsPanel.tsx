"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { markReviewsViewed } from "@/app/actions/diagnostics";
import { findingLabel } from "@/components/findingLabels";
import type { Finding } from "@/lib/analytics/postTradeDiagnosis";
import type { TradeRow } from "@/types/database";

function money(n: number | null): string {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

/**
 * Auto-surfaced counterpart to the Journal's on-demand "Diagnose selected"
 * action: trades that closed with a full risk plan get their diagnosis
 * generated in the background (see app/actions/diagnostics.ts's
 * getMaturedReviews) once they've had ~a month to play out, and show up
 * here until dismissed. Each card ties the trade's plan (entry/stop/target),
 * its actual exit, why it was entered and why it was exited, and what the
 * diagnosis found - the "connected" view of a trade requested alongside
 * this feature.
 */
export function TradeReviewsPanel({ reviews }: { reviews: { trade: TradeRow; findings: Finding[] }[] }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const visible = reviews.filter((r) => !dismissed.has(r.trade.id));
  if (visible.length === 0) return null;

  async function dismiss(tradeIds: string[]) {
    setBusy(true);
    await markReviewsViewed(tradeIds);
    setBusy(false);
    setDismissed((prev) => new Set([...prev, ...tradeIds]));
    router.refresh();
  }

  return (
    <div className="mb-6 rounded border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-indigo-900 dark:text-indigo-300">
          {visible.length} trade review{visible.length === 1 ? "" : "s"} ready — a month out from close, here&apos;s what played out
        </h2>
        <button
          onClick={() => dismiss(visible.map((r) => r.trade.id))}
          disabled={busy}
          className="text-xs text-indigo-700 hover:underline disabled:opacity-50 dark:text-indigo-400"
        >
          Dismiss all
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {visible.map(({ trade: t, findings }) => (
          <div key={t.id} className="rounded border border-indigo-100 bg-white p-3 dark:border-indigo-900/50 dark:bg-zinc-900">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <Link href={`/journal/${t.id}`} className="font-medium underline-offset-2 hover:underline">
                  {t.symbol}
                </Link>
                <span className="ml-2 text-xs capitalize text-zinc-500">{t.side}</span>
              </div>
              <button
                onClick={() => dismiss([t.id])}
                disabled={busy}
                className="text-xs text-zinc-400 hover:text-zinc-600 disabled:opacity-50 dark:hover:text-zinc-300"
              >
                Dismiss
              </button>
            </div>

            {/* The connected plan: entry -> stop/target -> what actually happened, in one line. */}
            <p className="mb-2 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
              <span>Entry {money(t.entry_price)}</span>
              <span>·</span>
              <span>Stop {money(t.planned_stop)} / Target {money(t.planned_target)}</span>
              <span>·</span>
              <span>Exit {money(t.exit_price)}</span>
            </p>

            {(t.thesis || t.exit_reason) && (
              <div className="mb-2 grid gap-2 text-xs sm:grid-cols-2">
                {t.thesis && (
                  <p className="text-zinc-600 dark:text-zinc-300">
                    <span className="font-medium text-zinc-500">Why you entered: </span>
                    {t.thesis}
                  </p>
                )}
                {t.exit_reason && (
                  <p className="text-zinc-600 dark:text-zinc-300">
                    <span className="font-medium text-zinc-500">Why you exited: </span>
                    {t.exit_reason}
                  </p>
                )}
              </div>
            )}

            <ul className="list-inside list-disc space-y-1">
              {findings.map((f, i) => (
                <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                    {findingLabel[f.kind]}
                  </span>
                  {f.message}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
