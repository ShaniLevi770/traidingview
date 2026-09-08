/** Shared contract every broker importer module implements (see lib/importers/README.md). */

export type RawSide = "Buy" | "Sell";

/** One execution/fill, normalized from a broker's raw export. */
export interface RawExecution {
  symbol: string;
  side: RawSide;
  quantity: number;
  price: number;
  time: Date; // real UTC instant (see lib/time.ts)
  /** Realized P&L already reported by the broker for this fill, if any (0 for an opening/adding fill). Null if the broker doesn't report it (importer must compute it itself in groupIntoTrades). */
  grossPnl: number | null;
  fee: number;
  raw: Record<string, string>; // original row, for debugging/preview
}

/** One flat-to-flat position lifecycle, ready to insert as a `trades` row. */
export interface ParsedTrade {
  symbol: string;
  side: "long" | "short";
  quantity: number; // net size at the widest point of the lifecycle
  /** Null when the opening fill(s) weren't in the imported file - see `entryKnown`. */
  entryPrice: number | null;
  entryTime: Date | null;
  exitPrice: number | null; // weighted average of closing fills; null if still open
  exitTime: Date | null;
  fees: number;
  pnl: number | null; // sum of realized P&L across closing fills; null if still open
  status: "open" | "closed";
  /**
   * False when this trade's opening fill(s) predate the imported file's
   * window (detected via a closing execution reporting nonzero realized
   * P&L while our running position for the symbol was flat) - the realized
   * pnl/exit are still trustworthy (taken from the broker's own figures),
   * but entryPrice/entryTime/quantity are unknown, not zero.
   */
  entryKnown: boolean;
  note?: string;
  sourceExecutions: RawExecution[];
}

export interface ParseWarning {
  row: number;
  message: string;
}

export interface ParseResult {
  executions: RawExecution[];
  warnings: ParseWarning[];
}

export interface Importer {
  /** Broker id, used as the `trades.source` / `csv_imports.broker` value. */
  id: string;
  displayName: string;
  /** Parses raw file text into normalized executions. Never throws on a bad row - collects a warning and skips it instead, so one malformed line doesn't fail the whole import. */
  parseFile(raw: string, opts: { sourceTimeZone: string }): ParseResult;
  /** Groups executions (already time-sorted per symbol) into round-trip trades. */
  groupIntoTrades(executions: RawExecution[]): ParsedTrade[];
}
