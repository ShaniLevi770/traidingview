/**
 * Offline sanity check for the S&P 500 overlay logic (parseStooqCsv +
 * alignBenchmarkToEquityCurve), since this sandbox can't reach stooq.com to
 * test against a live response. Uses a synthetic CSV in Stooq's documented
 * format. Run with: npx tsx scripts/verify-spy-overlay.ts
 */
import { parseStooqCsv } from "../lib/quotes/stooq-parse";
import { alignBenchmarkToEquityCurve } from "../lib/analytics/benchmark";
import type { EquityPoint } from "../lib/analytics/metrics";

const sampleCsv = `Date,Open,High,Low,Close,Volume
2026-01-02,470.00,472.00,469.00,471.00,50000000
2026-01-03,471.00,475.00,470.50,474.00,48000000
2026-01-04,N/D,N/D,N/D,N/D,N/D
2026-01-05,474.50,480.00,474.00,479.00,52000000
2026-01-08,479.50,485.00,478.00,484.00,49000000`;

const closes = parseStooqCsv(sampleCsv);
console.log("Parsed closes:", closes);
if (!closes || closes.length !== 4) {
  console.error(`FAIL: expected 4 rows (N/D row skipped), got ${closes?.length}`);
  process.exit(1);
}
if (closes[0].date !== "2026-01-02" || closes[0].close !== 471) {
  console.error("FAIL: first row mismatch");
  process.exit(1);
}

const equityCurve: EquityPoint[] = [
  { tradeId: "1", symbol: "AAPL", date: "2026-01-03T00:00:00.000Z", pnl: 100, cumulativePnl: 100 },
  { tradeId: "2", symbol: "MSFT", date: "2026-01-06T00:00:00.000Z", pnl: -50, cumulativePnl: 50 }, // Jan 6 is a weekend/no-data day - should fall back to Jan 5's close
  { tradeId: "3", symbol: "TSLA", date: "2026-01-08T00:00:00.000Z", pnl: 30, cumulativePnl: 80 },
];

const aligned = alignBenchmarkToEquityCurve(equityCurve, closes);
console.log("\nAligned benchmark:", aligned);

// Baseline = close on 2026-01-03 (474) -> 0%
if (Math.abs(aligned[0].pctChange) > 0.001) {
  console.error(`FAIL: baseline point should be 0%, got ${aligned[0].pctChange}`);
  process.exit(1);
}
// Jan 6 (no data) should use the most recent prior close: Jan 5 = 479 -> (479-474)/474*100
const expectedPoint2 = ((479 - 474) / 474) * 100;
if (Math.abs(aligned[1].pctChange - expectedPoint2) > 0.01) {
  console.error(`FAIL: expected ${expectedPoint2.toFixed(3)}%, got ${aligned[1].pctChange}`);
  process.exit(1);
}
// Jan 8 close = 484 -> (484-474)/474*100
const expectedPoint3 = ((484 - 474) / 474) * 100;
if (Math.abs(aligned[2].pctChange - expectedPoint3) > 0.01) {
  console.error(`FAIL: expected ${expectedPoint3.toFixed(3)}%, got ${aligned[2].pctChange}`);
  process.exit(1);
}

console.log("\nAll checks passed.");
