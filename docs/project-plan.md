# TradingView-powered Trading Journal — Project Plan

> Original planning document from project kickoff. Preserved here so it
> survives across sessions (it previously lived only at a sandbox-local
> path, `/root/.claude/plans/...`, which does not persist). For what's
> actually been built since — including features added beyond this
> original scope — see `docs/project-context.md`.

## Context

This repo (`traidingview`) is currently empty — no commits, no code. The goal
is a **multi-user trading journal for beginners**: users log their trades,
see the real TradingView chart for each one, import trade history from
**Colmex Pro** (their day-trading broker) via CSV, and get performance
insights (win rate, P&L, R-multiple, equity curve, etc.) to help them learn
from their trading — planned risk vs. actual outcome, not just P&L.

Key constraints discovered during planning:
- **TradingView has no public API** — not for order/trade history, and not
  for quotes either. Its in-app broker integrations and price data are
  internal to TradingView's own UI/widgets. So "TradingView" contributes
  exactly one thing to this app: **the free embeddable chart widget**
  (visual only, no data extraction possible from it).
- **Colmex Pro trade history**, not TradingView's, is the real data source —
  pulled via CSV export (MTS account → Trade History → date range →
  "Excel"/CSV). Colmex does offer a FIX API for institutional clients on
  request, but that's not something to depend on for an MVP; CSV import is
  the reliable path.
- **Live/current prices need a separate quotes API** (Finnhub) — needed to
  show unrealized P&L on still-open positions, since neither TradingView nor
  Colmex's CSV export can supply that.

Decisions locked in with the user:
- **Multi-user** from the start (needs auth + per-user data isolation).
- **Stack:** Next.js (React + TypeScript) + Supabase (Postgres + Auth +
  Storage), deployed on Vercel. One codebase, fastest path to a working
  multi-user MVP.
- **Analytics/insights logic lives in its own isolated module** (not mixed
  into UI/API code), so that a future Python (FastAPI) service for
  ML-driven insights (pattern detection, predictive scoring) can be added
  later as an additive service reading the same Postgres DB — without
  rewriting the journal, auth, CSV import, or chart embed.
- **Equities only** for MVP (no options) — confirmed by both the real Colmex
  export sample (`Symb. type` is `Equities` on every row) and the user.
- **CSV import groups Colmex's own realized P&L**, rather than reimplementing
  FIFO cost-basis math (see "Colmex CSV format" below — Colmex already
  computes it per closing fill).

MVP scope (per user): trade journal + notes (with pre-trade risk planning),
TradingView chart embed on each trade, Colmex Pro CSV import, live
unrealized P&L on open positions, and a performance analytics dashboard.

## Real sample data reviewed

Two files from the user were used to ground this plan (not hypothetical):

1. **A real Colmex Pro "Filled orders" CSV export** — confirmed the actual
   column set, delimiter, date format, and P&L-per-execution convention (see
   below).
2. **The user's manual trading-journal template** (Hebrew column headers) —
   confirmed the exact risk-planning field set beginners expect to fill in:
   entry/stop/target prices, planned R:R, money at risk, planned R, actual R,
   actual $ result, rule-adherence, notes, thesis/setup, screenshot link, and
   status (open/closed). This template *is* the trade form's field list.

### Colmex CSV format (from the real export)

- Semicolon-delimited: `Date/Time; Symbol; Side; Quantity; Price; Gross P/L; Execution fee; Net P/L; Symb. type`
- Date is **day-first**: `DD.MM.YYYY  HH:MM:SS` (two spaces before time) —
  must use an explicit day-first parser, not a locale-guessing one, or
  `03.09.2026` silently becomes March instead of September.
- Numbers may carry a thousands separator (`1,582.77000000`) — strip commas
  before parsing.
- **Colmex already computes realized P&L per execution.** An execution that
  *opens or adds to* a position shows `Gross P/L = 0.00`; an execution that
  *closes* a position (fully or partially) shows the real realized P&L for
  that close, e.g. `Buy 4 @ 281.92` (opens, P/L 0.00) → later
  `Sell 4 @ 261.37` (closes, P/L −82.20, and (261.37−281.92)×4 = −82.20 ✓).
  **This means the importer does not need to reimplement FIFO cost-basis
  math** — Colmex already did it. The importer's job is *grouping*: walk each
  symbol's fills in time order, and bundle everything between "position
  leaves zero" and "position returns to zero" into one journal trade, summing
  the closing fill(s)' P&L and computing a display entry/exit price
  (weighted average) from the opening/closing fills.
- **Trade boundary rule:** a trade = one symbol's position lifecycle from
  flat → flat. Re-entering the same symbol after going flat is a new trade.
  Shorts are matched the same way (`Sell` opens, `Buy` closes).
- **Open positions at file edges are expected** (the file may end mid-trade,
  or reflect a partial export) — import these as `status = 'open'`, no
  `exit_price`/`exit_time`, rather than erroring.
- **Timestamps are in the account's local wall-clock time**, not US market
  time — confirmed by fill-time clustering around `16:30` and `21:xx–23:xx`
  local, matching 9:30/16:00 ET market open/close with a several-hour offset.
  Store the raw timestamp plus a normalized value (US/Eastern, since that's
  the market's own clock) so time-of-day/day-of-week analytics aren't wrong
  for a user in a different timezone.
- `Symb. type` is always `Equities` in the sample — consistent with the
  equities-only decision.
- **Partial-export edge case (found while implementing, verified against
  the real sample):** if the export window doesn't include a position's
  opening fill(s), that position's closing fill arrives at the grouper with
  no tracked position to close. Colmex's own "0.00 = opens, nonzero =
  closes" convention makes this detectable: a fill seen while flat with a
  **nonzero** `Gross P/L` must be closing a pre-existing, out-of-window
  position, not opening a new one. Such trades are emitted with
  `entryKnown: false` (entry price/date unknown, exit price/date and the
  broker-reported P&L preserved) rather than silently misread as a fresh
  open with the real P&L discarded. Confirmed against the sample: 3 of 17
  grouped trades hit this case, and the recovered P&L reconciles exactly
  (sum of realized P&L across all closed trades matches with vs. without
  the fix, off by exactly the 3 recovered amounts). The trade preview UI
  must surface `entryKnown: false` trades distinctly (e.g. "entry unknown —
  partial history").

## Importer pattern (broker-namespaced, for future brokers)

Every broker's CSV→trade logic lives in its own folder under `lib/importers/`,
all implementing the same interface, so adding Interactive Brokers (or any
other broker) later means adding one new folder — never touching Colmex's
code or scattering broker-specific parsing elsewhere:

```
lib/importers/
├─ types.ts              ← shared contract every broker module implements:
│                            parseFile(raw) → RawExecution[]
│                            groupIntoTrades(executions) → ParsedTrade[]
│                            (a broker with pre-netted rows, unlike Colmex's
│                            per-fill export, can make groupIntoTrades a
│                            passthrough — the interface stays the same)
├─ colmex/
│  ├─ parse.ts            ← Colmex CSV → RawExecution[] (day-first dates,
│  │                         semicolon delimiter, comma-stripping)
│  ├─ group.ts             ← flat-to-flat position grouping, sums Colmex's
│  │                         own realized P&L per closing fill
│  └─ index.ts             ← exports a single ColmexImporter implementing types.ts
└─ interactiveBrokers/     ← future: same shape, e.g. parse.ts + group.ts + index.ts
   └─ index.ts
```

`app/api/import/[broker]/route.ts` (or a broker param on one route) just
looks up the right module by broker id and calls its `parseFile` /
`groupIntoTrades` — the import UI, preview screen, `csv_imports` audit
table, and duplicate-detection logic are all broker-agnostic and don't
change when a new broker is added.

> **Update since this was written:** two more Colmex/TradingView export
> formats were added as sibling modules exactly as this pattern intended —
> `colmexPositions/` and `colmexOrderHistory/`. See
> `docs/project-context.md` for what each one does.

## Architecture

```
Next.js app (TypeScript)
├─ App Router pages (UI): journal, trade detail, import, dashboard
├─ API routes (/app/api/*): trades CRUD, CSV import, analytics, quotes
├─ lib/analytics/   ← isolated insights module (pure functions, no UI/DB coupling)
├─ lib/importers/   ← one namespaced module per broker (see "Importer pattern" below)
├─ lib/quotes/       ← Finnhub client, thin wrapper + short-TTL cache
└─ Supabase client (auth + Postgres + storage)

Supabase (hosted)
├─ Postgres — trades, tags, imports, users (auth.users)
├─ Auth — email/password (+ optionally Google) login
├─ Storage — trade screenshots, uploaded CSV files
└─ Row-Level Security — each user only ever sees their own rows

External APIs
├─ TradingView Advanced Chart widget — embedded, visual only, no data extraction
└─ Finnhub — current price quotes, for unrealized P&L on open positions only

(Future, additive) Python FastAPI insights service
└─ Reads the same Postgres DB, exposes /insights/* for ML-driven analysis;
   called by the Next.js dashboard as just another API.
```

## Data model (Supabase Postgres)

- `profiles` (1:1 with `auth.users`) — display name, starting account balance.
- `trades` — core fields plus the risk-planning fields from the user's own
  journal template:
  - Identity/execution: `id, user_id, symbol, side (long/short), quantity,
    entry_price, entry_time, exit_price, exit_time, fees, pnl,
    status ('open' | 'closed')`
  - Risk planning (optional — populated manually, since CSV import can't
    know intent): `planned_stop, planned_target` → derive `planned_rr`,
    `money_at_risk`, `planned_r`, `actual_r` (`pnl ÷ money_at_risk`)
  - Learning/context: `strategy_tag, mistake_tags[], followed_plan (bool),
    notes, thesis (text), screenshot_url`
  - Provenance: `source ('manual' | 'colmex_csv'), import_batch_id, created_at`
- `tags` — user-defined strategy/mistake tags (simple `text[]` columns on
  `trades` for MVP instead of a join table — start simple).
- `csv_imports` — `id, user_id, broker ('colmex'), filename, imported_at,
  row_count, status` — audit trail of each import batch, so trades created
  from an import can be traced/undone.

RLS policies: every table scoped to `auth.uid() = user_id`.

## Feature breakdown

1. **Auth** — Supabase Auth (email/password to start). Signup, login,
   logout, session middleware protecting all `/app/*` routes.
2. **Trade journal (CRUD)** — list view (sortable/filterable table, shows
   live unrealized P&L for open trades), trade detail page, create/edit form
   (manual entry, including pre-trade risk planning fields — also the
   fallback/annotation path for CSV-imported trades), delete/archive.
3. **TradingView chart embed** — TradingView's free embeddable widget on the
   trade detail page, pre-set to the trade's symbol and a date range around
   entry/exit.
4. **Colmex Pro CSV import** — upload page → the `colmex` importer module
   (`lib/importers/colmex/`) parses the CSV (day-first dates, semicolon
   delimiter, comma thousands-separator handling) → groups fills into
   flat-to-flat trades per symbol (summing Colmex's own realized P&L, not
   recomputing it) → preview grouped trades before committing (flag any row
   that failed to parse) → insert as a batch tied to a `csv_imports` row,
   with duplicate-range detection. Built against the shared `Importer`
   interface (see "Importer pattern") so Interactive Brokers or others can
   be added later as sibling modules, not by touching this code.
5. **Live unrealized P&L** — for `status = 'open'` trades, fetch a current
   quote via `lib/quotes/` (Finnhub), cached ~1–5 min per symbol, computed as
   `(current_price − entry_price) × qty × (±1 for long/short)`, clearly
   labeled "unrealized, as of [time]" vs. a closed trade's final `pnl`.
6. **Analytics dashboard** — `lib/analytics/` computes: win rate, average
   win/loss, profit factor, P&L over time, equity curve, best/worst
   symbols/tags, current streak, **average R and rule-adherence win-rate
   split** (the plan-vs-actual insight the user's own template is built
   around). Charts via Recharts/Lightweight Charts.

## Key files to create (representative, not exhaustive)

- `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`
- `app/journal/page.tsx` (trade list), `app/journal/[id]/page.tsx` (trade detail + chart)
- `app/journal/new/page.tsx` (manual entry form, incl. risk-planning fields)
- `app/import/page.tsx` (CSV upload + preview)
- `app/dashboard/page.tsx` (analytics)
- `app/api/trades/route.ts`, `app/api/trades/[id]/route.ts`
- `app/api/import/[broker]/route.ts` — looks up the broker's importer module by id
- `app/api/quotes/[symbol]/route.ts`
- `lib/importers/types.ts` — shared `Importer` interface every broker module implements
- `lib/importers/colmex/{parse,group,index}.ts` — Colmex CSV parsing + flat-to-flat position grouping
- `lib/analytics/metrics.ts` — pure functions: winRate(trades), equityCurve(trades), avgR(trades), etc.
- `lib/quotes/finnhub.ts` — quote fetch + short-TTL cache
- `lib/supabase/{client,server}.ts` — Supabase client helpers
- `supabase/migrations/*.sql` — table + RLS definitions
- `components/TradingViewWidget.tsx` — chart embed wrapper

## Verification

- `npm run dev` locally against a Supabase project (or local Supabase via
  `supabase start`) to confirm signup/login, trade CRUD, and RLS isolation
  (two test users can't see each other's trades).
- Import the real Colmex sample CSV and confirm: dates parsed correctly
  (day-first), grouped trades' P&L matches the sum of Colmex's own closing
  fills, open positions at the file's edges import as `status='open'`
  without erroring.
- Confirm an open trade shows a live unrealized P&L that updates (within the
  cache TTL) and a closed trade shows its final realized P&L, clearly
  distinguished in the UI.
- Confirm the TradingView widget loads and shows the correct symbol/date
  range on a trade detail page.
- Confirm dashboard metrics (win rate, P&L, avg R) match a hand-computed
  check on a small seeded set of trades.
- `npm run build` to catch type errors before considering a phase done.

## Explicitly out of scope for MVP (future phases)

- Live broker API integration (Colmex FIX API or others) for automatic
  real-time trade sync — CSV import only for now.
- Options/derivatives — equities only.
- The Python ML/insights microservice — architecture leaves room for it,
  but it isn't built in this phase.
- Mobile app — web only, responsive.
- Data export (download-your-own-journal CSV) and demo/sample seed data —
  good, cheap additions, worth doing early in Phase 1+ but not blocking the
  first working version.
