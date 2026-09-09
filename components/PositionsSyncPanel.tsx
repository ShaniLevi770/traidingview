"use client";

import { useState } from "react";
import { previewPositionsSync, commitPositionsSync, type PositionSyncPreviewRow } from "@/app/actions/positionsSync";

const statusLabel: Record<PositionSyncPreviewRow["status"], string> = {
  matched: "Will update",
  no_match: "No matching open trade — skipped",
  ambiguous: "Multiple open trades match — skipped",
};
const statusClass: Record<PositionSyncPreviewRow["status"], string> = {
  matched: "text-emerald-600",
  no_match: "text-zinc-400",
  ambiguous: "text-amber-600",
};

export function PositionsSyncPanel() {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewPositionsSync>> | null>(null);
  const [status, setStatus] = useState<"idle" | "previewing" | "committing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [updatedCount, setUpdatedCount] = useState<number | null>(null);

  async function handleFile(file: File) {
    const text = await file.text();
    setCsvText(text);
    setStatus("previewing");
    setError(null);
    setUpdatedCount(null);
    const result = await previewPositionsSync(text);
    if (result.error) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setPreview(result);
    setStatus("idle");
  }

  async function handleConfirm() {
    if (!csvText) return;
    setStatus("committing");
    const result = await commitPositionsSync(csvText);
    if (result.error) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setUpdatedCount(result.updated);
    setStatus("done");
  }

  const matchedCount = preview?.rows.filter((r) => r.status === "matched").length ?? 0;

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Sync stop-loss / take-profit from open positions</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Export your current open positions from TradingView/Colmex (includes each position&apos;s live Take Profit and
        Stop Loss — not available in the trade-history export, since an order that hasn&apos;t triggered yet isn&apos;t a
        &quot;filled&quot; trade). Matches each row to an open trade already in your journal by symbol + side, and fills in
        its planned stop/target.
      </p>

      <div className="mb-4 flex flex-col gap-4 rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <label className="flex flex-col gap-1 text-sm">
          Positions CSV file
          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>

      {status === "previewing" && <p className="text-sm text-zinc-500">Parsing…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {status === "done" && (
        <p className="mb-4 text-sm text-emerald-600">
          Updated {updatedCount} trade{updatedCount === 1 ? "" : "s"}.
        </p>
      )}

      {preview && status !== "done" && (
        <>
          <div className="mb-4 overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-zinc-100 text-left text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium">Symbol</th>
                  <th className="px-3 py-2 font-medium">Side</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Take Profit</th>
                  <th className="px-3 py-2 font-medium">Stop Loss</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2 font-medium">{r.symbol}</td>
                    <td className="px-3 py-2 capitalize">{r.side}</td>
                    <td className="px-3 py-2">{r.quantity}</td>
                    <td className="px-3 py-2">{r.takeProfit ?? "—"}</td>
                    <td className="px-3 py-2">{r.stopLoss ?? "—"}</td>
                    <td className={`px-3 py-2 ${statusClass[r.status]}`}>{statusLabel[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleConfirm}
            disabled={status === "committing" || matchedCount === 0}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
          >
            {status === "committing" ? "Updating…" : `Update ${matchedCount} trade${matchedCount === 1 ? "" : "s"}`}
          </button>
        </>
      )}
    </div>
  );
}
