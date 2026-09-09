/**
 * Manual verification (not a unit test) of the pure diagnoseTrade logic
 * against synthetic daily bars, covering all finding kinds - including the
 * stop-vs-target race for a premature manual exit. Run with:
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
    bar("2026-02-05", 58, 59, 57), // a couple days after exit, well past +2%
    bar("2026-02-10", 60, 61, 59),
  ];
  const d = diagnoseTrade(input, bars);
  check("continued_after_exit fires", d.findings.some((f) => f.kind === "continued_after_exit"));
  check("target_reachable_not_captured does NOT fire (exit == target)", !d.findings.some((f) => f.kind === "target_reachable_not_captured"));
  check("no premature-exit finding (exit was at target)", !d.findings.some((f) => f.kind.startsWith("premature_exit")));
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

// Case 5: long trade, manual exit between stop/target, price later hits TARGET first - the main new check.
{
  const input: DiagnosisTradeInput = {
    symbol: "EEE",
    side: "long",
    entryPrice: 100,
    entryDate: "2026-05-01",
    exitPrice: 105, // bailed early - neither stop (90) nor target (120) hit
    exitDate: "2026-05-05",
    plannedTarget: 120,
    plannedStop: 90,
  };
  const bars = [
    bar("2026-05-01", 101, 103, 99),
    bar("2026-05-05", 105, 106, 104),
    bar("2026-05-10", 110, 111, 108),
    bar("2026-05-15", 121, 122, 119), // target (120) reached first
  ];
  const d = diagnoseTrade(input, bars);
  check("premature_exit_missed_target fires", d.findings.some((f) => f.kind === "premature_exit_missed_target"));
  check("no other premature-exit variant also fires", d.findings.filter((f) => f.kind.startsWith("premature_exit")).length === 1);
}

// Case 6: same setup, but price instead hits the STOP first - the early exit was the right call.
{
  const input: DiagnosisTradeInput = {
    symbol: "FFF",
    side: "long",
    entryPrice: 100,
    entryDate: "2026-06-01",
    exitPrice: 98, // small loss, bailed early - neither stop (90) nor target (120) hit
    exitDate: "2026-06-05",
    plannedTarget: 120,
    plannedStop: 90,
  };
  const bars = [
    bar("2026-06-01", 99, 101, 97),
    bar("2026-06-05", 98, 99, 96),
    bar("2026-06-10", 93, 95, 91),
    bar("2026-06-15", 88, 92, 87), // stop (90) reached first
  ];
  const d = diagnoseTrade(input, bars);
  check("premature_exit_dodged_stop fires", d.findings.some((f) => f.kind === "premature_exit_dodged_stop"));
}

// Case 7: exit was (approximately) AT the planned stop - the plan itself triggered the exit, not a manual bail. No premature-exit finding expected.
{
  const input: DiagnosisTradeInput = {
    symbol: "GGG",
    side: "long",
    entryPrice: 100,
    entryDate: "2026-07-01",
    exitPrice: 90.1, // essentially the stop (90), within tolerance
    exitDate: "2026-07-05",
    plannedTarget: 120,
    plannedStop: 90,
  };
  const bars = [
    bar("2026-07-01", 99, 101, 97),
    bar("2026-07-05", 90.1, 92, 89),
    bar("2026-07-15", 125, 126, 124), // even if price later ran to target, this wasn't a premature exit
  ];
  const d = diagnoseTrade(input, bars);
  check("no premature-exit finding when exit was at the stop itself", !d.findings.some((f) => f.kind.startsWith("premature_exit")));
}

// Case 8: manual exit between levels, but stop and target both fall inside the SAME day's range afterward - ambiguous.
{
  const input: DiagnosisTradeInput = {
    symbol: "HHH",
    side: "long",
    entryPrice: 100,
    entryDate: "2026-08-01",
    exitPrice: 105,
    exitDate: "2026-08-05",
    plannedTarget: 120,
    plannedStop: 90,
  };
  const bars = [
    bar("2026-08-01", 101, 103, 99),
    bar("2026-08-05", 105, 106, 104),
    bar("2026-08-10", 110, 125, 85), // a single wild-range day spans both the 90 stop and the 120 target
  ];
  const d = diagnoseTrade(input, bars);
  check("premature_exit_ambiguous fires", d.findings.some((f) => f.kind === "premature_exit_ambiguous"));
}

console.log("\nDone.");
