/**
 * Manual verification (not a unit test) of reviewWindow's date-range math.
 * Run with:
 *   npx tsx scripts/verify-trade-review-range.ts
 */
import { reviewWindow } from "../lib/analytics/tradeReviewRange";

function check(name: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${name}`);
  if (!condition) process.exitCode = 1;
}

// Closed trade, daily interval - window pads both sides, capped by neither since exit+pad is in the past.
{
  const w = reviewWindow("2026-05-01", "2026-05-20", "d", "2026-09-09");
  check("daily from pads before entry", w.from === "2026-04-19");
  check("daily to pads after exit", w.to === "2026-06-01");
}

// Still-open trade (exitDate null) - anchors the "to" side on today instead; padding past today is still capped.
{
  const w = reviewWindow("2026-08-01", null, "d", "2026-09-09");
  check("open trade to caps at today", w.to === "2026-09-09");
}

// Closed trade where exit+padding would land in the future - capped at today.
{
  const w = reviewWindow("2026-09-01", "2026-09-08", "d", "2026-09-09");
  check("to never exceeds today", w.to === "2026-09-09");
}

// Weekly interval uses a much wider pad than daily.
{
  const w = reviewWindow("2026-05-01", "2026-05-20", "w", "2026-09-09");
  check("weekly window is wider than daily", w.from < "2026-04-19");
}

// Monthly interval wider still.
{
  const wWeekly = reviewWindow("2026-05-01", "2026-05-20", "w", "2026-09-09");
  const wMonthly = reviewWindow("2026-05-01", "2026-05-20", "m", "2026-09-09");
  check("monthly window is wider than weekly", wMonthly.from < wWeekly.from);
}

console.log("\nDone.");
