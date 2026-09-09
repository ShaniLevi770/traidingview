"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteTrades, setStrategyForTrades } from "@/app/actions/trades";
import { diagnoseTrades, type TradeDiagnosisResult } from "@/app/actions/diagnostics";
import type { TradeRow } from "@/types/database";

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { style: "currency", currency: "USD" })}`;
}

const findingLabel: Record<TradeDiagnosisResult["findings"][number]["kind"], string> = {
  target_reachable_not_captured: "Target reachable, not captured",
  continued_after_exit: "Kept moving after exit",
  recovered_after_stop: "Recovered after stop",
  premature_exit_missed_target: "Exited early — target would have hit",
  premature_exit_dodged_stop: "Exited early — dodged the stop",
  premature_exit_ambiguous: "Exited early — outcome unclear",
};

export function JournalTable({
  rows,
  unrealizedById,
}: {
  rows: TradeRow[];
  unrealizedById: Record<string, number | null>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<TradeDiagnosisResult[] | null>(null);
  const [tagging, setTagging] = useState(false);
  const [strategyInput, setStrategyInput] = useState("");
  const [showStrategyInput, setShowStrategyInput] = useState(false);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDeleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const label = ids.length === 1 ? "this trade" : `these ${ids.length} trades`;
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;

    setDeleting(true);
    const result = await deleteTrades(ids);
    setDeleting(false);
    if (result.error) {
      window.alert(`Couldn't delete: ${result.error}`);
      return;
    }
    setSelected(new Set());
    setDiagnosis(null);
    router.refresh();
  }

  async function handleDiagnoseSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setDiagnosing(true);
    setDiagnosis(null);
    const results = await diagnoseTrades(ids);
    setDiagnosing(false);
    setDiagnosis(results);
  }

  async function handleApplyStrategy() {
    const ids = [...selected];
    if (ids.length === 0 || !strategyInput.trim()) return;
    setTagging(true);
    const result = await setStrategyForTrades(ids, strategyInput);
    setTagging(false);
    if (result.error) {
      window.alert(`Couldn't set strategy: ${result.error}`);
      return;
    }
    setShowStrategyInput(false);
    setStrategyInput("");
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex min-h-[36px] flex-wrap items-center gap-2">
        {someSelected && (
          <>
            <span className="text-sm text-zinc-500">{selected.size} selected</span>
            <button
              onClick={handleDiagnoseSelected}
              disabled={diagnosing || deleting || tagging}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
            >
              {diagnosing ? "Diagnosing…" : "Diagnose selected"}
            </button>
            {showStrategyInput ? (
              <>
                <input
                  autoFocus
                  value={strategyInput}
                  onChange={(e) => setStrategyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleApplyStrategy();
                    if (e.key === "Escape") setShowStrategyInput(false);
                  }}
                  placeholder="e.g. breakout, VWAP reclaim"
                  className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button
                  onClick={handleApplyStrategy}
                  disabled={tagging || !strategyInput.trim()}
                  className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
                >
                  {tagging ? "Applying…" : `Apply to ${selected.size}`}
                </button>
                <button
                  onClick={() => setShowStrategyInput(false)}
                  disabled={tagging}
                  className="text-sm text-zinc-500 hover:underline"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowStrategyInput(true)}
                disabled={deleting || diagnosing}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
              >
                Set strategy…
              </button>
            )}
            <button
              onClick={handleDeleteSelected}
              disabled={deleting || diagnosing || tagging}
              className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50 dark:border-red-900"
            >
              {deleting ? "Deleting…" : "Delete selected"}
            </button>
          </>
        )}
      </div>

      {diagnosis && (
        <div className="mb-4 rounded border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-medium text-zinc-500">Diagnosis</h2>
          <div className="flex flex-col gap-3">
            {diagnosis.map((d) => (
              <div key={d.tradeId}>
                <p className="text-sm font-medium">{d.symbol}</p>
                {d.skippedReason ? (
                  <p className="text-sm text-zinc-400">{d.skippedReason}</p>
                ) : (
                  <ul className="mt-1 list-inside list-disc space-y-1">
                    {d.findings.map((f, i) => (
                      <li key={i} className="text-sm text-zinc-600 dark:text-zinc-300">
                        <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                          {findingLabel[f.kind]}
                        </span>
                        {f.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-zinc-100 text-left text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="w-8 px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all trades" />
              </th>
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
              const displayPnl = isOpen ? unrealizedById[t.id] ?? null : t.pnl;
              return (
                <tr key={t.id} className="border-t border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={() => toggleOne(t.id)}
                      aria-label={`Select ${t.symbol}`}
                    />
                  </td>
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
    </div>
  );
}
