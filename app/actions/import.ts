"use server";

import { verifySession } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getImporter } from "@/lib/importers";
import type { ParsedTrade } from "@/lib/importers/types";

export interface ImportPreviewTrade {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number | null;
  entryTime: string | null;
  exitPrice: number | null;
  exitTime: string | null;
  fees: number;
  pnl: number | null;
  status: "open" | "closed";
  entryKnown: boolean;
  note?: string;
}

export interface PreviewResult {
  trades: ImportPreviewTrade[];
  warnings: { row: number; message: string }[];
  error?: string;
}

function toPreview(t: ParsedTrade): ImportPreviewTrade {
  return {
    symbol: t.symbol,
    side: t.side,
    quantity: t.quantity,
    entryPrice: t.entryPrice,
    entryTime: t.entryTime?.toISOString() ?? null,
    exitPrice: t.exitPrice,
    exitTime: t.exitTime?.toISOString() ?? null,
    fees: t.fees,
    pnl: t.pnl,
    status: t.status,
    entryKnown: t.entryKnown,
    note: t.note,
  };
}

export async function previewImport(
  broker: string,
  csvText: string,
  sourceTimeZone: string,
): Promise<PreviewResult> {
  await verifySession();

  const importer = getImporter(broker);
  if (!importer) return { trades: [], warnings: [], error: `Unknown broker "${broker}".` };

  const { executions, warnings } = importer.parseFile(csvText, { sourceTimeZone });
  const trades = importer.groupIntoTrades(executions).map(toPreview);

  return { trades, warnings };
}

export async function commitImport(
  broker: string,
  csvText: string,
  sourceTimeZone: string,
  filename: string,
): Promise<{ error?: string; imported?: number }> {
  const { userId } = await verifySession();

  const importer = getImporter(broker);
  if (!importer) return { error: `Unknown broker "${broker}".` };

  const { executions } = importer.parseFile(csvText, { sourceTimeZone });
  const trades = importer.groupIntoTrades(executions);

  const supabase = await createClient();

  const { data: importRow, error: importError } = await supabase
    .from("csv_imports")
    .insert({ user_id: userId, broker, filename, row_count: trades.length })
    .select()
    .single();
  if (importError || !importRow) {
    return { error: importError?.message ?? "Could not create import record." };
  }

  const { error: tradesError } = await supabase.from("trades").insert(
    trades.map((t) => ({
      user_id: userId,
      symbol: t.symbol,
      side: t.side,
      quantity: t.quantity,
      entry_price: t.entryPrice, // null when entryKnown is false - never a fabricated placeholder
      entry_time: (t.entryTime ?? t.exitTime ?? new Date()).toISOString(), // falls back to exit time only for sort ordering; entry_known still reflects the real unknown
      entry_known: t.entryKnown,
      exit_price: t.exitPrice,
      exit_time: t.exitTime?.toISOString() ?? null,
      fees: t.fees,
      pnl: t.pnl,
      status: t.status,
      notes: t.entryKnown ? null : t.note,
      source: "colmex_csv" as const,
      import_batch_id: importRow.id,
    })),
  );

  if (tradesError) return { error: tradesError.message };
  return { imported: trades.length };
}
