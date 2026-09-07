# Trading Journal

A multi-user trading journal for beginners: log trades (with a pre-trade risk
plan, not just the outcome), see the real TradingView chart next to each one,
import your Colmex Pro trade history from CSV, and get performance insights
— including whether following your own plan actually correlates with better
results.

See `/root/.claude/plans/lexical-weaving-rose.md` (or ask in-session) for the
full project plan and the reasoning behind the architecture below — this
README covers setup only.

## Stack

- **Next.js** (App Router, TypeScript) — UI + API routes + Server Actions
- **Supabase** — Postgres, Auth, and Storage (screenshots)
- **TradingView** Advanced Chart widget — free, embeddable, display-only (no
  API exists for pulling TradingView's own data — see the plan)
- **Finnhub** — current-price quotes, used only for unrealized P&L on open
  positions (a separate concern from the chart widget)

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the migrations** in `supabase/migrations/` against it, in order —
   either via the Supabase SQL editor (paste each file's contents), or with
   the Supabase CLI: `supabase db push`.
3. **Get a free Finnhub API key** at [finnhub.io](https://finnhub.io) (used
   only for unrealized P&L on still-open positions).
4. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase
     dashboard → Settings → API)
   - `FINNHUB_API_KEY`
5. `npm install`
6. `npm run dev` → [http://localhost:3000](http://localhost:3000)

## Project structure

```
app/
  (auth)/login, (auth)/signup      — auth pages
  journal/                          — trade list, detail, new-trade form
  import/                           — CSV import (upload → preview → commit)
  dashboard/                        — analytics
  actions/                          — Server Actions (auth, trades, import)
  api/quotes/[symbol]/              — current-price lookup (Finnhub)
lib/
  analytics/metrics.ts              — pure functions: win rate, R-multiples,
                                       equity curve, plan-adherence split, etc.
                                       Deliberately isolated from UI/DB code,
                                       so a future Python service could take
                                       over the more advanced analysis later.
  importers/
    types.ts                        — the `Importer` interface every broker module implements
    colmex/                         — Colmex Pro CSV parsing + trade grouping
    (add a new broker as a sibling folder here — see types.ts)
  quotes/finnhub.ts                 — current price lookups (open positions only)
  supabase/                         — Supabase client helpers (browser/server/DAL/storage)
  time.ts                           — timezone conversion (CSV wall-clock → UTC; UTC → market time for analytics)
proxy.ts                            — session refresh + route protection (Next.js 16+ renamed middleware.ts to this)
supabase/migrations/                — SQL schema + RLS policies + storage bucket
scripts/verify-colmex-import.ts     — manual check: `npx tsx scripts/verify-colmex-import.ts <csv>`
```

## Notable implementation details

- **Colmex CSV import does not reimplement FIFO cost-basis math** — Colmex
  already reports realized P&L per closing execution. The importer's job is
  *grouping* fills into flat-to-flat position lifecycles, trusting Colmex's
  own numbers. See `lib/importers/colmex/group.ts` for the full reasoning,
  including the partial-export edge case (`entryKnown: false`) where a
  closing fill's opening trade isn't in the imported file.
- **Timestamps**: CSV timestamps are wall-clock, in whatever timezone the
  trading terminal was set to (not necessarily US market time) — the import
  UI asks for that timezone (defaulting to the browser's) and converts to
  real UTC instants for storage. Analytics that care about time-of-day
  read back in US/Eastern (`lib/time.ts`), regardless of the viewer's
  timezone.
- **Risk-planning fields** (`planned_stop`, `planned_target`) are optional
  and manual-only — a CSV import has no way to know trade intent. Importing
  a trade is meant to be followed by reviewing it and filling these in.
