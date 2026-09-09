/**
 * Manual verification script (not a unit test) - parses the real Colmex
 * "Order History (All)" sample export, groups trades, and attaches planned
 * stop/target levels, so all three steps can be eyeballed against the
 * source file. Run with:
 *   npx tsx scripts/verify-colmex-order-history.ts /tmp/order-history.csv
 */
import { readFileSync } from "node:fs";
import { colmexOrderHistoryImporter } from "../lib/importers/colmexOrderHistory";

const path = process.argv[2];
if (!path) {
  console.error("Usage: tsx scripts/verify-colmex-order-history.ts <path-to-csv>");
  process.exit(1);
}

const raw = readFileSync(path, "utf-8");
const opts = { sourceTimeZone: "Asia/Jerusalem" };

const { executions, warnings } = colmexOrderHistoryImporter.parseFile(raw, opts);
console.log(`Parsed ${executions.length} executions, ${warnings.length} warnings.`);
for (const w of warnings) console.log(`  [warn] row ${w.row}: ${w.message}`);

let trades = colmexOrderHistoryImporter.groupIntoTrades(executions);
console.log(`\nGrouped into ${trades.length} trades before planned-level attachment.`);

trades = colmexOrderHistoryImporter.attachPlannedLevels!(trades, raw, opts);

let totalPnl = 0;
let withStop = 0;
let withTarget = 0;
for (const t of trades) {
  if (t.pnl != null) totalPnl += t.pnl;
  if (t.plannedStop != null) withStop++;
  if (t.plannedTarget != null) withTarget++;
  console.log(
    `${t.symbol.padEnd(6)} ${t.side.padEnd(5)} qty=${t.quantity.toString().padEnd(4)} ` +
      `entry=${(t.entryPrice?.toFixed(2) ?? "unknown").padEnd(9)} exit=${(t.exitPrice?.toFixed(2) ?? "(open)").padEnd(9)} ` +
      `pnl=${t.pnl?.toFixed(2) ?? "-"} status=${t.status} entryKnown=${t.entryKnown} ` +
      `plannedStop=${t.plannedStop ?? "-"} plannedTarget=${t.plannedTarget ?? "-"} ` +
      `entryTime=${t.entryTime?.toISOString() ?? "-"} exitTime=${t.exitTime?.toISOString() ?? "-"}` +
      (t.note ? `\n       note: ${t.note}` : ""),
  );
}

console.log(
  `\nSum of realized pnl across ${trades.filter((t) => t.status === "closed").length} closed trades: ${totalPnl.toFixed(2)}`,
);
console.log(`Trades with plannedStop: ${withStop}, with plannedTarget: ${withTarget}, total: ${trades.length}`);

const dgx = trades.find((t) => t.symbol === "DGX");
if (dgx) {
  console.log(`\nDGX check: plannedStop=${dgx.plannedStop} (expect 188.87), plannedTarget=${dgx.plannedTarget} (expect 234.15)`);
}
