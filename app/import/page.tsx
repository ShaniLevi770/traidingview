"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { previewImport, commitImport, type ImportPreviewTrade } from "@/app/actions/import";
import { detectLocalTimeZone } from "@/lib/time";
import { PositionsSyncPanel } from "@/components/PositionsSyncPanel";

const BROKERS = [
  { id: "colmexOrderHistory", label: "Colmex Pro (Order History - All) - recommended" },
  { id: "colmex", label: "Colmex Pro (Filled orders)" },
];

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { style: "currency", currency: "USD" })}`;
}

export default function ImportPage() {
  const router = useRouter();
  const [broker, setBroker] = useState(BROKERS[0].id);
  const [timeZone, setTimeZone] = useState(() => detectLocalTimeZone());
  const [csvText, setCsvText] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<{ trades: ImportPreviewTrade[]; warnings: { row: number; message: string }[] } | null>(null);
  const [status, setStatus] = useState<"idle" | "previewing" | "committing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setFilename(file.name);
    const text = await file.text();
    setCsvText(text);
    setStatus("previewing");
    setError(null);
    const result = await previewImport(broker, text, timeZone);
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
    const result = await commitImport(broker, csvText, timeZone, filename);
    if (result.error) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setStatus("done");
    router.push("/journal");
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Import trades</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Export your trade history from Colmex Pro / TradingView (Order History → date range → export) and upload it here.
        The &quot;Order History (All)&quot; export is recommended — it also carries your Stop Loss/Take Profit orders, so
        planned risk levels get filled in automatically, even for trades that are already closed.
      </p>

      <div className="mb-6 flex flex-col gap-4 rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <label className="flex flex-col gap-1 text-sm">
          Broker
          <select value={broker} onChange={(e) => setBroker(e.target.value)} className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
            {BROKERS.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Timezone the export&apos;s timestamps are in
          <input value={timeZone} onChange={(e) => setTimeZone(e.target.value)} className="rounded border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900" />
          <span className="text-xs text-zinc-400">Detected from your browser — correct it if your trading terminal was set to a different timezone.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          CSV file
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

      {preview && (
        <>
          {preview.warnings.length > 0 && (
            <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              <p className="mb-1 font-medium">{preview.warnings.length} row(s) skipped:</p>
              <ul className="list-inside list-disc">
                {preview.warnings.map((w, i) => (
                  <li key={i}>Row {w.row}: {w.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mb-4 overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-zinc-100 text-left text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium">Symbol</th>
                  <th className="px-3 py-2 font-medium">Side</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Entry</th>
                  <th className="px-3 py-2 font-medium">Exit</th>
                  <th className="px-3 py-2 font-medium">P&amp;L</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.trades.map((t, i) => (
                  <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2 font-medium">{t.symbol}</td>
                    <td className="px-3 py-2 capitalize">{t.side}</td>
                    <td className="px-3 py-2">{t.quantity}</td>
                    <td className="px-3 py-2">{t.entryKnown ? t.entryPrice : <span className="text-amber-600">unknown</span>}</td>
                    <td className="px-3 py-2">{t.exitPrice ?? "open"}</td>
                    <td className={`px-3 py-2 font-medium ${t.pnl != null && t.pnl > 0 ? "text-emerald-600" : t.pnl != null && t.pnl < 0 ? "text-red-600" : ""}`}>
                      {formatMoney(t.pnl)}
                    </td>
                    <td className="px-3 py-2">{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleConfirm}
            disabled={status === "committing"}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
          >
            {status === "committing" ? "Importing…" : `Import ${preview.trades.length} trade(s)`}
          </button>
        </>
      )}

      <hr className="my-10 border-zinc-200 dark:border-zinc-800" />

      <PositionsSyncPanel />
    </div>
  );
}
