/**
 * Manual verification (not a unit test) of the pure diagnoseTrade logic
 * against synthetic daily bars, covering the three finding kinds. Run with:
 *   npx tsx scripts/verify-post-trade-diagnosis.ts
 */
import { diagnoseTrade, type DiagnosisTradeInput } from "../lib/analytics/postTradeDiagnosis";
import type { DailyClose } from "../lib/quotes/stooq-parse";

function bar(date: string, close: number, high?: number, low?: number): DailyClose {
  return { date, close, high: high ?? close, low: low ?? close };
}

function check(name: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${name}`);
  if (!condition) process.exitCode = 1;
}

// Case 1: long trade, target touched intraday but exit missed it - expect target_reachable_not_captured.
{
  const input: DiagnosisTradeInput = {
    symbol: "AAA",
    side: "long",
    entryPrice: 100,
    entryDate: "2026-01-05",
    exitPrice: 108,
    exitDate: "2026-01-07",
    plannedTarget: 112,
    plannedStop: 95,
  };
  const bars = [
    bar("2026-01-05", 101, 102, 99),
    bar("2026-01-06", 110, 113, 105), // touched 113, above the 112 target, before exit
    bar("2026-01-07", 108, 109, 106), // exited at 108, below target
  ];
  const d = diagnoseTrade(input, bars);
  check("target_reachable_not_captured fires", d.findings.some((f) => f.kind === "target_reachable_not_captured"));
}

// Case 2: long trade, exit was fine, but price kept climbing afterward - expect continued_after_exit.
{
  const input: DiagnosisTradeInput = {
    symbol: "BBB",
    side: "long",
    entryPrice: 50,
    entryDate: "2026-02-01",
    exitPrice: 55,
    exitDate: "2026-02-03",
    plannedTarget: 55,
    plannedStop: 47,
  };
  const bars = [
    bar("2026-02-01", 51, 52, 49),
    bar("2026-02-03", 55, 55.5, 54),
    bar("2026-02-05", 58, 59, 57), // 2 days after exit, well past +2%
    bar("2026-02-10", 60, 61, 59),
  ];
  const d = diagnoseTrade(input, bars);
  check("continued_after_exit fires", d.findings.some((f) => f.kind === "continued_after_exit"));
  check("target_reachable_not_captured does NOT fire (exit == target)", !d.findings.some((f) => f.kind === "target_reachable_not_captured"));
}

// Case 3: short trade, stopped out at a loss, price later fell back below entry - expect recovered_after_stop.
{
  const input: DiagnosisTradeInput = {
    symbol: "CCC",
    side: "short",
    entryPrice: 200,
    entryDate: "2026-03-01",
    exitPrice: 210, // stopped out - price went up against the short
    exitDate: "2026-03-02",
    plannedTarget: 180,
    plannedStop: 210,
  };
  const bars = [
    bar("2026-03-01", 202, 205, 199),
    bar("2026-03-02", 210, 212, 208),
    bar("2026-03-06", 195, 196, 193), // recovered back below entry (200) within the window
    bar("2026-03-10", 178, 179, 177), // even reached the original 180 target
  ];
  const d = diagnoseTrade(input, bars);
  check("recovered_after_stop fires", d.findings.some((f) => f.kind === "recovered_after_stop"));
  const msg = d.findings.find((f) => f.kind === "recovered_after_stop")?.message ?? "";
  check("recovered_after_stop message notes reaching the original target too", msg.includes("original target"));
}

// Case 4: closed trade with no notable post-trade action - expect zero findings.
{
  const input: DiagnosisTradeInput = {
    symbol: "DDD",
    side: "long",
    entryPrice: 100,
    entryDate: "2026-04-01",
    exitPrice: 103,
    exitDate: "2026-04-02",
    plannedTarget: 110,
    plannedStop: 95,
  };
  const bars = [
    bar("2026-04-01", 101, 102, 99),
    bar("2026-04-02", 103, 104, 101),
    bar("2026-04-05", 103.5, 104, 102), // basically flat afterward
  ];
  const d = diagnoseTrade(input, bars);
  check("no findings for an unremarkable trade", d.findings.length === 0);
}

console.log("\nDone.");
