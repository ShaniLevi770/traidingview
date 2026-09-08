import { zonedWallTimeToUtc } from "@/lib/time";
import type { ParseResult, ParseWarning, RawExecution, RawSide } from "@/lib/importers/types";

/**
 * Parses a Colmex Pro "Filled orders" CSV export.
 *
 * Format confirmed against a real export:
 *   Date/Time;Symbol;Side;Quantity;Price;Gross P/L;Execution fee;Net P/L;Symb. type;
 *   03.09.2026  22:45:37;DKNG;Buy;27;24.36000000;101.52 USD;0.00 USD;101.52 USD;Equities;
 *
 * Notable format quirks, all handled here:
 *  - Semicolon-delimited, trailing semicolon (empty last field) on each row.
 *  - Date is DAY-FIRST (DD.MM.YYYY), two spaces before the time - a
 *    locale-guessing date parser would silently misread this.
 *  - Numbers may carry a thousands separator, e.g. "1,582.77000000".
 *  - Money fields carry a " USD" suffix.
 *  - Symb. type is "Equities" for stock trades - MVP only supports these;
 *    other types (if present) are skipped with a warning, not silently
 *    dropped from the row count.
 */

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/;

function parseMoney(field: string): number {
  return Number(field.replace(/USD/i, "").replace(/,/g, "").trim());
}

function parseColmexDate(field: string, sourceTimeZone: string): Date | null {
  const match = DATE_RE.exec(field.trim());
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min, ss] = match;
  return zonedWallTimeToUtc(
    {
      year: Number(yyyy),
      month: Number(mm),
      day: Number(dd),
      hour: Number(hh),
      minute: Number(min),
      second: Number(ss),
    },
    sourceTimeZone,
  );
}

export function parseColmexCsv(
  raw: string,
  opts: { sourceTimeZone: string },
): ParseResult {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const executions: RawExecution[] = [];
  const warnings: ParseWarning[] = [];

  if (lines.length === 0) {
    return { executions, warnings: [{ row: 0, message: "File is empty." }] };
  }

  // First line is the header - skip it, but don't assume an exact column
  // order match beyond what we rely on (defends against Colmex reordering
  // or adding columns without breaking the whole import).
  const header = lines[0].split(";").map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    dateTime: col("date/time"),
    symbol: col("symbol"),
    side: col("side"),
    quantity: col("quantity"),
    price: col("price"),
    grossPnl: col("gross p/l"),
    fee: col("execution fee"),
    symbType: col("symb. type"),
  };
  const missing = Object.entries(idx).filter(([, i]) => i === -1);
  if (missing.length > 0) {
    return {
      executions,
      warnings: [
        {
          row: 0,
          message: `Unrecognized Colmex export format - missing column(s): ${missing.map(([k]) => k).join(", ")}.`,
        },
      ],
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1; // 1-indexed, matching a spreadsheet view
    const fields = lines[i].split(";");

    const symbType = fields[idx.symbType]?.trim();
    if (symbType && symbType.toLowerCase() !== "equities") {
      warnings.push({
        row: rowNum,
        message: `Skipped: instrument type "${symbType}" is not supported yet (equities only).`,
      });
      continue;
    }

    const time = parseColmexDate(fields[idx.dateTime] ?? "", opts.sourceTimeZone);
    const symbol = fields[idx.symbol]?.trim();
    const sideRaw = fields[idx.side]?.trim();
    const quantity = Number(fields[idx.quantity]?.trim());
    const price = parseMoney(fields[idx.price] ?? "");
    const grossPnlField = fields[idx.grossPnl]?.trim();
    const fee = parseMoney(fields[idx.fee] ?? "0");

    if (!time || !symbol || (sideRaw !== "Buy" && sideRaw !== "Sell") || !Number.isFinite(quantity) || !Number.isFinite(price)) {
      warnings.push({ row: rowNum, message: "Skipped: could not parse this row." });
      continue;
    }

    const raw: Record<string, string> = {};
    header.forEach((h, i) => (raw[h] = fields[i] ?? ""));

    executions.push({
      symbol,
      side: sideRaw as RawSide,
      quantity,
      price,
      time,
      grossPnl: grossPnlField ? parseMoney(grossPnlField) : null,
      fee,
      raw,
    });
  }

  return { executions, warnings };
}
