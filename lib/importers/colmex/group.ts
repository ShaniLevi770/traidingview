import type { ParsedTrade, RawExecution } from "@/lib/importers/types";

/**
 * Groups a symbol's fills into flat-to-flat position lifecycles ("trades").
 *
 * Colmex already computes realized P&L per closing execution (confirmed
 * against a real export: an opening/adding fill shows Gross P/L = 0.00, a
 * closing fill shows the real realized amount, and it checks out exactly
 * against (exitPrice - entryPrice) * qty for every matched pair in the
 * sample file). So this does NOT reimplement FIFO cost-basis math - it
 * trusts each execution's reported `grossPnl` for the closing portion, and
 * only computes a fallback if a future broker doesn't provide one.
 *
 * Trade boundary rule: a trade spans from the moment a symbol's position
 * leaves zero to the moment it returns to zero. A fill that closes the
 * current position AND opens a new one in the opposite direction (a
 * "flip") is split: the closing portion finalizes the current trade, and
 * the leftover quantity starts a new one - handled by the inner while loop
 * below rather than as a special case.
 */
export function groupColmexExecutions(executions: RawExecution[]): ParsedTrade[] {
  const bySymbol = new Map<string, RawExecution[]>();
  for (const exec of executions) {
    const list = bySymbol.get(exec.symbol) ?? [];
    list.push(exec);
    bySymbol.set(exec.symbol, list);
  }

  const trades: ParsedTrade[] = [];

  for (const [symbol, execs] of bySymbol) {
    const sorted = [...execs].sort((a, b) => a.time.getTime() - b.time.getTime());
    trades.push(...groupSymbolExecutions(symbol, sorted));
  }

  return trades;
}

interface OpenLifecycle {
  side: "long" | "short";
  entryQty: number;
  entryPriceSum: number;
  exitQty: number;
  exitPriceSum: number;
  pnl: number;
  fees: number;
  entryTime: Date;
  exitTime: Date | null;
  execs: RawExecution[];
}

function groupSymbolExecutions(symbol: string, execs: RawExecution[]): ParsedTrade[] {
  const trades: ParsedTrade[] = [];
  let open: OpenLifecycle | null = null;

  for (const exec of execs) {
    let qtyRemaining = exec.quantity;

    while (qtyRemaining > 0) {
      if (!open) {
        // Colmex reports Gross P/L = 0.00 for every fill that opens or adds
        // to a position, and a nonzero amount for every fill that closes
        // one. So a fill arriving here (position flat, per our view) with a
        // nonzero grossPnl isn't actually opening anything - it's closing a
        // position whose opening fill(s) predate this file's export window.
        // Surface it as a partial-history trade instead of misreading it as
        // a fresh open and silently discarding real, already-realized P&L.
        if (exec.grossPnl) {
          trades.push({
            symbol,
            side: exec.side === "Buy" ? "short" : "long", // closing fill is opposite the original position's side
            quantity: qtyRemaining,
            entryPrice: null,
            entryTime: null,
            exitPrice: exec.price,
            exitTime: exec.time,
            fees: exec.fee * (qtyRemaining / exec.quantity),
            pnl: exec.grossPnl,
            status: "closed",
            entryKnown: false,
            note: "Opening fill(s) for this trade weren't in the imported file (partial export) - entry price/date unknown, but the exit and P&L are Colmex's own reported figures.",
            sourceExecutions: [exec],
          });
          qtyRemaining = 0;
          continue;
        }

        open = {
          side: exec.side === "Buy" ? "long" : "short",
          entryQty: 0,
          entryPriceSum: 0,
          exitQty: 0,
          exitPriceSum: 0,
          pnl: 0,
          fees: 0,
          entryTime: exec.time,
          exitTime: null,
          execs: [],
        };
      }

      const isOpeningDirection =
        (open.side === "long" && exec.side === "Buy") ||
        (open.side === "short" && exec.side === "Sell");

      if (isOpeningDirection) {
        open.entryQty += qtyRemaining;
        open.entryPriceSum += exec.price * qtyRemaining;
        open.fees += exec.fee * (qtyRemaining / exec.quantity);
        open.execs.push(exec);
        qtyRemaining = 0;
      } else {
        const currentPositionQty = open.entryQty - open.exitQty;
        const closeQty = Math.min(qtyRemaining, currentPositionQty);
        const avgEntryPriceSoFar = open.entryPriceSum / open.entryQty;

        open.exitQty += closeQty;
        open.exitPriceSum += exec.price * closeQty;
        open.pnl +=
          exec.grossPnl ??
          fallbackPnl(open.side, avgEntryPriceSoFar, exec.price, closeQty);
        open.fees += exec.fee * (closeQty / exec.quantity);
        open.exitTime = exec.time;
        open.execs.push(exec);
        qtyRemaining -= closeQty;

        if (open.entryQty - open.exitQty === 0) {
          trades.push(finalize(symbol, open, "closed"));
          open = null;
        }
        // If qtyRemaining > 0 here, this fill flipped the position: loop
        // again with open === null, which starts a fresh lifecycle in the
        // opposite direction for the leftover quantity.
      }
    }
  }

  if (open) {
    trades.push(finalize(symbol, open, "open"));
  }

  return trades;
}

function fallbackPnl(
  side: "long" | "short",
  entryPrice: number,
  exitPrice: number,
  qty: number,
): number {
  return side === "long" ? (exitPrice - entryPrice) * qty : (entryPrice - exitPrice) * qty;
}

function finalize(
  symbol: string,
  open: OpenLifecycle,
  status: "open" | "closed",
): ParsedTrade {
  return {
    symbol,
    side: open.side,
    quantity: open.entryQty,
    entryPrice: open.entryPriceSum / open.entryQty,
    entryTime: open.entryTime,
    exitPrice: status === "closed" ? open.exitPriceSum / open.exitQty : null,
    exitTime: status === "closed" ? open.exitTime : null,
    fees: open.fees,
    pnl: status === "closed" ? open.pnl : null,
    status,
    entryKnown: true,
    sourceExecutions: open.execs,
  };
}
