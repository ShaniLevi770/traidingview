# Trading Journal

A multi-user trading journal for beginners: log trades (with a pre-trade risk
plan, not just the outcome), see the real TradingView chart next to each one,
import your Colmex Pro trade history from CSV, and get performance insights
— including whether following your own plan actually correlates with better
results, and post-trade checks on whether you actually stuck to your plan.

For the reasoning behind the architecture and everything built since the
original plan (including decisions/gotchas that aren't obvious from the code
alone), see:
- `docs/project-plan.md` — the original MVP plan.
- `docs/project-context.md` — what's been built beyond it, and why. **Read
  this before picking up work here** — it's also auto-loaded via
  `CLAUDE.md` for Claude Code sessions.

## Stack

- **Next.js** (App Router, TypeScript) — UI + API routes + Server Actions
- **Supabase** — Postgres, Auth, and Storage (screenshots)
- **TradingView** Advanced Chart widget — free, embeddable, display-only (no
  API exists for pulling TradingView's own data — see the plan)
- **Finnhub** — current-price quotes, used only for unrealized P&L on open
  positions (a separate concern from the chart widget)
- **Stooq** — free historical daily/weekly/monthly price data (no API key),
  used for the S&P 500 dashboard overlay, the post-trade diagnosis checks,
  and the trade review chart

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
  journal/                          — trade list (bulk select/delete/diagnose/tag),
                                       trade detail (+ TradingView chart, trade review
                                       chart, risk plan), new/edit trade forms
  import/                           — CSV import (upload → preview → commit) +
                                       Positions Sync panel
  dashboard/                        — analytics (equity curve, S&P 500 overlay)
  actions/                          — Server Actions: auth, trades, import,
                                       positionsSync, diagnostics, priceHistory
  api/quotes/[symbol]/              — current-price lookup (Finnhub)
lib/
  analytics/
    metrics.ts                       — pure functions: win rate, R-multiples,
                                        equity curve, plan-adherence split, etc.
                                        Deliberately isolated from UI/DB code,
                                        so a future Python service could take
                                        over the more advanced analysis later.
    benchmark.ts                     — aligns S&P 500 closes to the equity curve
    postTradeDiagnosis.ts            — "did I stick to my plan" checks (see docs/project-context.md)
    tradeReviewRange.ts              — date-range math for the trade review chart
  importers/
    types.ts                        — the `Importer` interface every broker module implements
    colmex/                         — "Filled orders" export: CSV parsing + trade grouping
    colmexPositions/                — "Positions" export: live TP/SL for open trades
    colmexOrderHistory/             — "Order History (All)" export: full history +
                                       backfills planned stop/target, even for closed trades
    (add a new broker as a sibling folder here — see types.ts)
  quotes/
    finnhub.ts                       — current price lookups (open positions only)
    stooq.ts, stooq-parse.ts         — historical daily/weekly/monthly OHLC
  supabase/                         — Supabase client helpers (browser/server/DAL/storage)
  time.ts                           — timezone conversion (CSV wall-clock → UTC; UTC → market
                                       time for analytics) + shared calendar-arithmetic helper
components/
  TradingViewWidget.tsx             — the embedded TradingView chart
  TradeReviewChart.tsx              — self-built entry/exit/stop/target chart (Recharts + Stooq)
  JournalTable.tsx                  — journal list with bulk select/delete/diagnose/tag
  EquityCurveChart.tsx              — dashboard equity curve (+ S&P 500 overlay toggle)
proxy.ts                            — session refresh + route protection (Next.js 16+ renamed middleware.ts to this)
supabase/migrations/                — SQL schema + RLS policies + storage bucket
scripts/verify-*.ts                 — manual verification scripts (this repo has no automated
                                       test suite — these are the closest thing to regression
                                       tests; run any of them with `npx tsx scripts/verify-....ts`)
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
- **Risk-planning fields** (`planned_stop`, `planned_target`) can come from
  three places: manual entry, the Positions Sync panel (currently-open
  trades only), or the Order History importer (backfills closed trades
  too). The post-trade diagnosis feature only runs on trades where both are
  set — see `docs/project-context.md`.
