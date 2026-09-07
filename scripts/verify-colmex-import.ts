/**
 * Manual verification script (not a unit test) - parses the real Colmex
 * sample export and prints the grouped trades, so the parser/grouper can be
 * eyeballed against the source file. Run with:
 *   npx tsx scripts/verify-colmex-import.ts /tmp/colmex-sample.csv
 */
import { readFileSync } from "node:fs";
import { colmexImporter } from "../lib/importers/colmex";

const path = process.argv[2];
if (!path) {
  console.error("Usage: tsx scripts/verify-colmex-import.ts <path-to-csv>");
  process.exit(1);
}

const raw = readFileSync(path, "utf-8");
const { executions, warnings } = colmexImporter.parseFile(raw, {
  sourceTimeZone: "Asia/Jerusalem",
});

console.log(`Parsed ${executions.length} executions, ${warnings.length} warnings.`);
for (const w of warnings) console.log(`  [warn] row ${w.row}: ${w.message}`);

const trades = colmexImporter.groupIntoTrades(executions);
console.log(`\nGrouped into ${trades.length} trades:\n`);

let totalPnl = 0;
for (const t of trades) {
  if (t.pnl != null) totalPnl += t.pnl;
  console.log(
    `${t.symbol.padEnd(6)} ${t.side.padEnd(5)} qty=${t.quantity.toString().padEnd(4)} ` +
      `entry=${(t.entryPrice?.toFixed(2) ?? "unknown").padEnd(9)} exit=${(t.exitPrice?.toFixed(2) ?? "(open)").padEnd(9)} ` +
      `pnl=${t.pnl?.toFixed(2) ?? "-"} status=${t.status} entryKnown=${t.entryKnown} ` +
      `entryTime=${t.entryTime?.toISOString() ?? "-"} exitTime=${t.exitTime?.toISOString() ?? "-"}` +
      (t.note ? `\n       note: ${t.note}` : ""),
  );
}

console.log(`\nSum of realized pnl across ${trades.filter((t) => t.status === "closed").length} closed trades: ${totalPnl.toFixed(2)}`);
