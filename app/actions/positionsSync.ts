"use server";

import { verifySession } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { parseColmexPositionsCsv } from "@/lib/importers/colmexPositions/parse";
import { matchPositionsToTrades, type MatchStatus } from "@/lib/importers/colmexPositions/match";

export interface PositionSyncPreviewRow {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  takeProfit: number | null;
  stopLoss: number | null;
  status: MatchStatus;
  /** Set only when status === "matched". */
  matchedTradeId: string | null;
}

export interface PositionSyncPreview {
  rows: PositionSyncPreviewRow[];
  parseWarnings: { row: number; message: string }[];
  error?: string;
}

async function loadOpenTrades(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("trades").select("id, symbol, side").eq("user_id", userId).eq("status", "open");
  return data ?? [];
}

export async function previewPositionsSync(csvText: string): Promise<PositionSyncPreview> {
  const { userId } = await verifySession();

  const { rows, warnings } = parseColmexPositionsCsv(csvText);
  if (rows.length === 0) {
    return { rows: [], parseWarnings: warnings, error: warnings[0]?.message ?? "No rows found." };
  }

  const openTrades = await loadOpenTrades(userId);
  const matches = matchPositionsToTrades(rows, openTrades);

  return {
    rows: matches.map((m) => ({
      symbol: m.position.symbol,
      side: m.position.side,
      quantity: m.position.quantity,
      takeProfit: m.position.takeProfit,
      stopLoss: m.position.stopLoss,
      status: m.status,
      matchedTradeId: m.matchedTradeId,
    })),
    parseWarnings: warnings,
  };
}

export async function commitPositionsSync(csvText: string): Promise<{ updated: number; error?: string }> {
  const { userId } = await verifySession();

  // Re-parse and re-match server-side rather than trusting client-supplied
  // match results, same defensive pattern as the trade CSV importer.
  const { rows } = parseColmexPositionsCsv(csvText);
  const openTrades = await loadOpenTrades(userId);
  const matches = matchPositionsToTrades(rows, openTrades);

  const toApply = matches.filter((m) => m.status === "matched" && m.matchedTradeId);
  if (toApply.length === 0) return { updated: 0 };

  const supabase = await createClient();
  let updated = 0;
  for (const m of toApply) {
    const { error } = await supabase
      .from("trades")
      .update({
        planned_target: m.position.takeProfit,
        planned_stop: m.position.stopLoss,
      })
      .eq("id", m.matchedTradeId!)
      .eq("user_id", userId);
    if (error) return { updated, error: error.message };
    updated++;
  }

  return { updated };
}
