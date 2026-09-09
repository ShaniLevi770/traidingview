import { zonedWallTimeToUtc } from "@/lib/time";
import type { ParseResult, ParseWarning, RawExecution, RawSide } from "@/lib/importers/types";

/**
 * Parses a TradingView/Colmex "Order History (All)" export - richer than
 * the original "Filled orders" export (lib/importers/colmex/parse.ts):
 * every order is a row, filled or cancelled, including the Stop
 * Loss/Take Profit bracket orders attached to a position - whichever one
 * of the pair didn't get hit still shows its configured price (Cancelled),
 * and the one that did shows the real exit (Filled). That's exactly the
 * planned-risk data the trade-level Positions export can't give for closed
 * trades (it's a snapshot of currently-open positions only).
 *
 * Real sample confirmed the format:
 *   Symbol,Side,Type,Qty,Filled Qty,Limit Price,Stop Price,Avg Fill Price,Status,Update Time,Gross P/L,Net P/L,Execution fee,Order ID
 *   DGX,Sell,Stop Loss,3,3,,188.87,188.73,Filled,2026-04-29 17:19:05,-37.95,-,-,53056330
 *   DGX,Sell,Take Profit,3,0,234.15,,,Cancelled,2026-04-29 17:19:06,-,-,-,53056332
 *
 * Comma-delimited, Update Time is "YYYY-MM-DD HH:MM:SS" (much simpler than
 * the original export's day-first format), money fields use "-" for blank
 * rather than an empty string.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/;

function parseNumberOrDash(raw: string | undefined): number | null {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === "-") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseUpdateTime(field: string, sourceTimeZone: string): Date | null {
  const match = DATE_RE.exec(field.trim());
  if (!match) return null;
  const [, yyyy, mm, dd, hh, min, ss] = match;
  return zonedWallTimeToUtc(
    { year: Number(yyyy), month: Number(mm), day: Number(dd), hour: Number(hh), minute: Number(min), second: Number(ss) },
    sourceTimeZone,
  );
}

interface Header {
  symbol: number;
  side: number;
  type: number;
  filledQty: number;
  limitPrice: number;
  stopPrice: number;
  avgFillPrice: number;
  status: number;
  updateTime: number;
  grossPnl: number;
  executionFee: number;
}

// Maps each internal field to the CSV column name a user would actually see
// in their export - used both to look the column up and, on a miss, to
// report it back in the warning using that same recognizable name rather
// than the internal camelCase key.
const COLUMNS: { key: keyof Header; label: string }[] = [
  { key: "symbol", label: "Symbol" },
  { key: "side", label: "Side" },
  { key: "type", label: "Type" },
  { key: "filledQty", label: "Filled Qty" },
  { key: "limitPrice", label: "Limit Price" },
  { key: "stopPrice", label: "Stop Price" },
  { key: "avgFillPrice", label: "Avg Fill Price" },
  { key: "status", label: "Status" },
  { key: "updateTime", label: "Update Time" },
  { key: "grossPnl", label: "Gross P/L" },
  { key: "executionFee", label: "Execution fee" },
];

function parseHeader(headerLine: string): { idx: Header; missing: string[] } {
  const header = headerLine.split(",").map((h) => h.trim().toLowerCase());
  const col = (label: string) => header.indexOf(label.toLowerCase());
  const idx = {} as Header;
  const missing: string[] = [];
  for (const { key, label } of COLUMNS) {
    const i = col(label);
    idx[key] = i;
    if (i === -1) missing.push(label);
  }
  return { idx, missing };
}

export function parseColmexOrderHistoryCsv(raw: string, opts: { sourceTimeZone: string }): ParseResult {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const executions: RawExecution[] = [];
  const warnings: ParseWarning[] = [];

  if (lines.length === 0) {
    return { executions, warnings: [{ row: 0, message: "File is empty." }] };
  }

  const { idx, missing } = parseHeader(lines[0]);
  if (missing.length > 0) {
    return {
      executions,
      warnings: [{ row: 0, message: `Unrecognized Order History export format - missing column(s): ${missing.join(", ")}.` }],
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const fields = lines[i].split(",");

    const filledQty = Number(fields[idx.filledQty]?.trim());
    if (!Number.isFinite(filledQty) || filledQty <= 0) continue; // an order that never (or only partly, 0-here) filled isn't an execution

    const symbol = fields[idx.symbol]?.trim();
    const sideRaw = fields[idx.side]?.trim();
    const price = Number(fields[idx.avgFillPrice]?.trim());
    const time = parseUpdateTime(fields[idx.updateTime] ?? "", opts.sourceTimeZone);

    if (!symbol || (sideRaw !== "Buy" && sideRaw !== "Sell") || !Number.isFinite(price) || !time) {
      warnings.push({ row: rowNum, message: "Skipped: could not parse this filled row." });
      continue;
    }

    const raw: Record<string, string> = {};
    lines[0].split(",").forEach((h, i) => (raw[h.trim().toLowerCase()] = fields[i] ?? ""));

    executions.push({
      symbol,
      side: sideRaw as RawSide,
      quantity: filledQty,
      price,
      time,
      grossPnl: parseNumberOrDash(fields[idx.grossPnl]),
      fee: parseNumberOrDash(fields[idx.executionFee]) ?? 0,
      raw,
    });
  }

  return { executions, warnings };
}

export interface BracketCandidate {
  symbol: string;
  kind: "stop" | "target";
  price: number;
  time: Date;
}

/**
 * Second pass over the same file: every Stop Loss / Take Profit order row
 * (filled OR cancelled - a cancelled one just means the position closed via
 * the other leg, or manually, before this one triggered) tells us what
 * level was actually set, which is what attachPlannedLevels below matches
 * back onto the grouped trades.
 */
export function extractBracketCandidates(raw: string, opts: { sourceTimeZone: string }): BracketCandidate[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const { idx, missing } = parseHeader(lines[0]);
  if (missing.length > 0) return [];

  const candidates: BracketCandidate[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(",");
    const type = fields[idx.type]?.trim().toLowerCase();
    if (type !== "stop loss" && type !== "take profit") continue;

    const symbol = fields[idx.symbol]?.trim();
    const time = parseUpdateTime(fields[idx.updateTime] ?? "", opts.sourceTimeZone);
    if (!symbol || !time) continue;

    const price = type === "stop loss" ? Number(fields[idx.stopPrice]?.trim()) : Number(fields[idx.limitPrice]?.trim());
    if (!Number.isFinite(price)) continue;

    candidates.push({ symbol, kind: type === "stop loss" ? "stop" : "target", price, time });
  }
  return candidates;
}
