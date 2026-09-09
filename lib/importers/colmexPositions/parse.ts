/**
 * Parses a Colmex/TradingView "Positions" export - a snapshot of currently
 * open positions, including their live Take Profit / Stop Loss (unlike the
 * "Filled orders" export, which only has executions and can't know about a
 * stop that hasn't triggered yet). Real sample confirmed the format:
 *
 *   Symbol,Side,Qty,Avg Fill Price,Take Profit,Stop Loss,Trailing Stop,Profit (value),Profit (currency),Update Time,Fee,Swaps,Net P/L,Position ID
 *   DOCN,Long,3,126.92,180.73,100.54,,-0.69,USD,,0.00,0.00,-0.69,11397778
 *
 * Comma-delimited (not semicolon, unlike the Filled orders export), Side is
 * "Long"/"Short" (not "Buy"/"Sell"), and there's no entry date/time at all -
 * this is a point-in-time snapshot of open positions, not a historical fills
 * log, so it can't be used to create full trade records on its own. Its job
 * is enriching an *already-imported* open trade with its real stop/target -
 * see lib/importers/colmexPositions/match.ts.
 */

export interface PositionRow {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  avgFillPrice: number;
  takeProfit: number | null;
  stopLoss: number | null;
  netPnl: number | null;
  positionId: string;
}

export interface PositionParseWarning {
  row: number;
  message: string;
}

export interface PositionParseResult {
  rows: PositionRow[];
  warnings: PositionParseWarning[];
}

function parseNumberOrNull(raw: string | undefined): number | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function parseColmexPositionsCsv(raw: string): PositionParseResult {
  const lines = raw.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: PositionRow[] = [];
  const warnings: PositionParseWarning[] = [];

  if (lines.length === 0) {
    return { rows, warnings: [{ row: 0, message: "File is empty." }] };
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    symbol: col("symbol"),
    side: col("side"),
    qty: col("qty"),
    avgFillPrice: col("avg fill price"),
    takeProfit: col("take profit"),
    stopLoss: col("stop loss"),
    netPnl: col("net p/l"),
    positionId: col("position id"),
  };
  const missing = Object.entries(idx).filter(([, i]) => i === -1);
  if (missing.length > 0) {
    return {
      rows,
      warnings: [
        {
          row: 0,
          message: `Unrecognized Positions export format - missing column(s): ${missing.map(([k]) => k).join(", ")}.`,
        },
      ],
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const fields = lines[i].split(",");

    const symbol = fields[idx.symbol]?.trim();
    const sideRaw = fields[idx.side]?.trim().toLowerCase();
    const quantity = Number(fields[idx.qty]?.trim());
    const avgFillPrice = Number(fields[idx.avgFillPrice]?.trim());
    const positionId = fields[idx.positionId]?.trim();

    if (!symbol || (sideRaw !== "long" && sideRaw !== "short") || !Number.isFinite(quantity) || !Number.isFinite(avgFillPrice) || !positionId) {
      warnings.push({ row: rowNum, message: "Skipped: could not parse this row." });
      continue;
    }

    rows.push({
      symbol,
      side: sideRaw,
      quantity,
      avgFillPrice,
      takeProfit: parseNumberOrNull(fields[idx.takeProfit]),
      stopLoss: parseNumberOrNull(fields[idx.stopLoss]),
      netPnl: parseNumberOrNull(fields[idx.netPnl]),
      positionId,
    });
  }

  return { rows, warnings };
}
