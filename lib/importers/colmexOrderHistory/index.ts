import type { Importer } from "@/lib/importers/types";
import { groupColmexExecutions } from "@/lib/importers/colmex/group";
import { parseColmexOrderHistoryCsv } from "@/lib/importers/colmexOrderHistory/parse";
import { attachPlannedLevels } from "@/lib/importers/colmexOrderHistory/attachPlannedLevels";

/**
 * TradingView/Colmex "Order History (All)" export - a richer alternative to
 * the original `colmex` "Filled orders" importer. Same flat-to-flat grouping
 * (reused as-is: both exports reduce to the same RawExecution shape once
 * parsed), but this format also carries every Stop Loss/Take Profit bracket
 * order, filled or cancelled, so it can additionally backfill the trade's
 * planned risk levels - including for trades that are already closed, which
 * the Positions-sync feature (lib/importers/colmexPositions/) can't do since
 * it only sees currently-open positions.
 */
export const colmexOrderHistoryImporter: Importer = {
  id: "colmexOrderHistory",
  displayName: "Colmex Pro (Order History - All)",
  parseFile: parseColmexOrderHistoryCsv,
  groupIntoTrades: groupColmexExecutions,
  attachPlannedLevels,
};
