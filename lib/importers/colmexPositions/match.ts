import type { PositionRow } from "@/lib/importers/colmexPositions/parse";

export interface OpenTradeRef {
  id: string;
  symbol: string;
  side: "long" | "short";
}

export type MatchStatus = "matched" | "no_match" | "ambiguous";

export interface PositionMatch {
  position: PositionRow;
  matchedTradeId: string | null;
  status: MatchStatus;
}

/**
 * Matches each position row to exactly one open journal trade by
 * symbol+side. Deliberately conservative: only applies when there's exactly
 * one open trade for that symbol/side - a Positions snapshot has no entry
 * date to disambiguate with, so guessing between multiple open trades on
 * the same symbol risks silently setting a stop/target on the wrong one.
 */
export function matchPositionsToTrades(positions: PositionRow[], openTrades: OpenTradeRef[]): PositionMatch[] {
  return positions.map((position) => {
    const candidates = openTrades.filter(
      (t) => t.symbol.toUpperCase() === position.symbol.toUpperCase() && t.side === position.side,
    );
    if (candidates.length === 1) {
      return { position, matchedTradeId: candidates[0].id, status: "matched" };
    }
    if (candidates.length === 0) {
      return { position, matchedTradeId: null, status: "no_match" };
    }
    return { position, matchedTradeId: null, status: "ambiguous" };
  });
}
