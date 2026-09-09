/**
 * Hand-written mirror of supabase/migrations/0001_init.sql. If you have the
 * Supabase CLI, prefer regenerating this with:
 *   supabase gen types typescript --local > types/database.ts
 * Kept minimal (just the `trades`-adjacent tables) rather than the full
 * generated shape, since that requires a running Supabase project.
 */

export type Side = "long" | "short";
export type TradeStatus = "open" | "closed";
export type TradeSource = "manual" | "colmex_csv";

export interface TradeRow {
  id: string;
  user_id: string;
  symbol: string;
  side: Side;
  quantity: number;
  /** Null only when entry_known = false (partial CSV import - see lib/importers/colmex/group.ts). */
  entry_price: number | null;
  entry_time: string; // ISO timestamp, UTC - always set (falls back to exit_time when entry_known is false)
  entry_known: boolean;
  exit_price: number | null;
  exit_time: string | null;
  fees: number;
  pnl: number | null;
  status: TradeStatus;

  planned_stop: number | null;
  planned_target: number | null;
  /** Free text, e.g. "2-3 days" - how long the trade was expected to take to reach profit. */
  expected_duration: string | null;

  strategy_tag: string | null;
  mistake_tags: string[];
  followed_plan: boolean | null;
  notes: string | null;
  /** Why the trade was entered - what was seen, why this stop/target. */
  thesis: string | null;
  /** Why it was exited at that price - the closing counterpart to `thesis`. */
  exit_reason: string | null;
  screenshot_url: string | null;

  /** Persisted output of lib/analytics/postTradeDiagnosis.ts, as Finding[] - see app/actions/diagnostics.ts. Null until generated. */
  diagnosis: { kind: string; message: string }[] | null;
  diagnosis_generated_at: string | null;
  /** Set once the user has seen this trade's auto-surfaced review (see TradeReviewsPanel). Null = pending/unread. */
  diagnosis_viewed_at: string | null;

  source: TradeSource;
  import_batch_id: string | null;
  created_at: string;
}

export interface CsvImportRow {
  id: string;
  user_id: string;
  broker: string;
  filename: string;
  imported_at: string;
  row_count: number;
  status: "completed" | "undone";
}

export interface ProfileRow {
  id: string; // = auth.users.id
  display_name: string | null;
  starting_balance: number | null;
}

type Row<T> = T & Record<string, unknown>;

export type Database = {
  public: {
    Tables: {
      trades: {
        Row: Row<TradeRow>;
        Insert: Row<Partial<TradeRow> & { user_id: string; symbol: string; side: Side; quantity: number }>;
        Update: Row<Partial<TradeRow>>;
        Relationships: [];
      };
      csv_imports: {
        Row: Row<CsvImportRow>;
        Insert: Row<Partial<CsvImportRow> & { user_id: string; broker: string; filename: string; row_count: number }>;
        Update: Row<Partial<CsvImportRow>>;
        Relationships: [];
      };
      profiles: {
        Row: Row<ProfileRow>;
        Insert: Row<Partial<ProfileRow> & { id: string }>;
        Update: Row<Partial<ProfileRow>>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
