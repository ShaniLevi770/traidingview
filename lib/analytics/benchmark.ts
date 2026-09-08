import type { EquityPoint } from "@/lib/analytics/metrics";
import type { DailyClose } from "@/lib/quotes/stooq";

export interface BenchmarkPoint {
  date: string;
  /** % change from the first close in the aligned series - comparable in shape to the equity curve, not in $ terms (different scale/units, hence the separate axis in the chart). */
  pctChange: number;
}

/**
 * Aligns a benchmark's (e.g. S&P 500) daily closes to the same dates as an
 * equity curve, for a "does my P&L correlate with the market" overlay. For
 * each equity curve point's date, finds the benchmark's most recent close
 * on or before that date (trades don't close exactly on trading-day
 * boundaries, and weekends/holidays have no benchmark row at all).
 */
export function alignBenchmarkToEquityCurve(
  equityCurve: EquityPoint[],
  benchmarkCloses: DailyClose[],
): BenchmarkPoint[] {
  if (equityCurve.length === 0 || benchmarkCloses.length === 0) return [];

  const sorted = [...benchmarkCloses].sort((a, b) => a.date.localeCompare(b.date));
  let baseline: number | null = null;
  let cursor = 0;

  return equityCurve.map((point) => {
    const targetDate = point.date.slice(0, 10); // equity curve dates are full ISO timestamps
    while (cursor + 1 < sorted.length && sorted[cursor + 1].date <= targetDate) {
      cursor++;
    }
    const close = sorted[cursor].close;
    if (baseline == null) baseline = close;
    return { date: point.date, pctChange: ((close - baseline) / baseline) * 100 };
  });
}
