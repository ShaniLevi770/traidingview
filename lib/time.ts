/**
 * Timezone helpers. Two distinct needs, kept separate on purpose:
 *
 * 1. Colmex (and other broker) CSV exports give wall-clock timestamps with
 *    no timezone attached - in practice, the trading terminal's local
 *    timezone (confirmed against a real Colmex export: fill times cluster
 *    around 16:30 and 21:xx-23:xx local, matching 9:30/16:00 ET market
 *    open/close for an account several hours ahead of ET - i.e. NOT ET
 *    itself). We ask the importing user which timezone that terminal was
 *    set to (defaulting to their browser's timezone) and convert to a real
 *    UTC instant for storage - see `zonedWallTimeToUtc`.
 *
 * 2. Once trades are stored as real UTC instants, "time of day" / "day of
 *    week" analytics (see lib/analytics) should read in the market's own
 *    clock (US/Eastern), regardless of what timezone the user is currently
 *    viewing from - see `easternParts`.
 */

const MARKET_TIME_ZONE = "America/New_York";

/**
 * Converts a wall-clock date/time in `timeZone` to a UTC Date.
 * Accurate for all instants except the handful of seconds inside a DST
 * transition gap, which real trade timestamps won't land on.
 */
export function zonedWallTimeToUtc(
  { year, month, day, hour, minute, second = 0 }: {
    year: number;
    month: number; // 1-12
    day: number;
    hour: number;
    minute: number;
    second?: number;
  },
  timeZone: string,
): Date {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(guessUtcMs)).map((p) => [p.type, p.value]),
  );
  const formattedAsUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  const offsetMs = formattedAsUtcMs - guessUtcMs;
  return new Date(guessUtcMs - offsetMs);
}

/** The market's local wall-clock representation of a UTC instant. */
export function easternParts(date: Date): {
  hour: number;
  minute: number;
  weekday: string; // "Mon".."Sun"
  isoDate: string; // YYYY-MM-DD in ET, for "trades per day" grouping
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday,
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** Best-effort IANA timezone of the current browser/runtime. */
export function detectLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return MARKET_TIME_ZONE;
  }
}
