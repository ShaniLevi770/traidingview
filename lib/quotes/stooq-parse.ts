/**
 * Pure CSV parsing, split out from stooq.ts (which is server-only and does
 * the actual network fetch) so this logic can be unit-tested directly - see
 * scripts/verify-spy-overlay.ts - without pulling in the "server-only"
 * guard, which throws outside Next's module graph on purpose.
 */

export interface DailyClose {
  date: string; // YYYY-MM-DD
  close: number;
}

export function parseStooqCsv(text: string): DailyClose[] | null {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null; // header only (or empty) - no data for this range

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const dateIdx = header.indexOf("date");
  const closeIdx = header.indexOf("close");
  if (dateIdx === -1 || closeIdx === -1) return null; // unexpected format - fail safe, don't guess columns

  const data: DailyClose[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const date = cols[dateIdx]?.trim();
    const closeRaw = cols[closeIdx]?.trim();
    if (!date || !closeRaw || closeRaw === "N/D") continue; // Stooq's marker for a no-data row
    const close = Number(closeRaw);
    if (!Number.isFinite(close)) continue;
    data.push({ date, close });
  }

  return data.length > 0 ? data : null;
}
