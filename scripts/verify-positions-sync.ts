/**
 * Offline check for the Positions CSV parser + matching logic, against the
 * real sample file's shape. Run with: npx tsx scripts/verify-positions-sync.ts
 */
import { readFileSync } from "node:fs";
import { parseColmexPositionsCsv } from "../lib/importers/colmexPositions/parse";
import { matchPositionsToTrades } from "../lib/importers/colmexPositions/match";

const path = process.argv[2] ?? "/tmp/positions-sample.csv";
const { rows, warnings } = parseColmexPositionsCsv(readFileSync(path, "utf-8"));
console.log(`Parsed ${rows.length} rows, ${warnings.length} warnings.`);
for (const w of warnings) console.log(`  [warn] row ${w.row}: ${w.message}`);

// Simulates the user's actual open trades in the journal (matches the
// earlier Colmex Filled-orders verification: DOCN, TEL, DKNG were all open).
const openTrades = [
  { id: "trade-docn", symbol: "DOCN", side: "long" as const },
  { id: "trade-tel", symbol: "TEL", side: "long" as const },
  { id: "trade-dkng", symbol: "DKNG", side: "short" as const },
  // Ambiguous case: a second open AAPL long, to confirm ambiguity detection.
  { id: "trade-aapl-1", symbol: "AAPL", side: "long" as const },
  { id: "trade-aapl-2", symbol: "AAPL", side: "long" as const },
];

const matches = matchPositionsToTrades(rows, openTrades);
for (const m of matches) {
  console.log(
    `${m.position.symbol.padEnd(6)} ${m.position.side.padEnd(5)} TP=${m.position.takeProfit ?? "-"} SL=${m.position.stopLoss ?? "-"} -> ${m.status}${m.matchedTradeId ? ` (${m.matchedTradeId})` : ""}`,
  );
}

const docn = matches.find((m) => m.position.symbol === "DOCN")!;
if (docn.status !== "matched" || docn.matchedTradeId !== "trade-docn") {
  console.error("FAIL: DOCN should match trade-docn");
  process.exit(1);
}
const dkng = matches.find((m) => m.position.symbol === "DKNG")!;
if (dkng.status !== "matched" || dkng.matchedTradeId !== "trade-dkng" || dkng.position.takeProfit !== null) {
  console.error("FAIL: DKNG should match trade-dkng with null TP (blank in source)");
  process.exit(1);
}

console.log("\nAll checks passed.");
