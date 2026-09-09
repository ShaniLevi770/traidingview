# Project context — read this before picking up work here

> Living document. This captures decisions, conventions, and gotchas that
> only exist in prior conversation history and would otherwise be lost when
> a session ends. Update it (don't just append forever — prune stale
> "known issues" once they're resolved) whenever you ship something whose
> reasoning isn't obvious from the code/commit alone. See
> `docs/project-plan.md` for the original MVP plan this project started
> from — most of what's below is what was built *beyond* that plan, driven
> by live user feedback after deployment.

## Status

All of the original MVP plan is built and merged to `main`, deployed on
Vercel (see README for stack/setup). Since then, several rounds of live
feedback (the user trades and uses the deployed app directly) have driven
additional features — richer CSV import, chart-sizing fixes, an S&P 500
benchmark overlay, bulk trade actions, and a "did I make the right call"
post-trade analytics feature that's actively being expanded.

## Import pipeline — three Colmex/TradingView export formats

`lib/importers/` is a broker-namespaced registry (see `types.ts` for the
shared `Importer` interface — `parseFile`, `groupIntoTrades`, optional
`attachPlannedLevels`). Three sibling modules exist, all producing the same
`RawExecution`/`ParsedTrade` shapes so `groupColmexExecutions`
(`lib/importers/colmex/group.ts`) is reused across all of them:

| Module | Source export | What it's for |
|---|---|---|
| `colmex/` | "Filled orders" — semicolon-delimited, day-first dates | Original importer. Execution-level only, no risk-plan data. |
| `colmexPositions/` | "Positions" — comma-delimited, no dates | Snapshot of **currently open** positions with live TP/SL. Powers "Positions Sync" (`app/actions/positionsSync.ts`) — matches by symbol+side, only when exactly one open trade matches (ambiguous/no-match rows are skipped, never guessed). |
| `colmexOrderHistory/` | "Order History (All)" — comma-delimited, richest | Every order ever, filled *and* cancelled — including bracket SL/TP orders. Can backfill `planned_stop`/`planned_target` on **already-closed** trades too, which Positions Sync structurally can't do (it only ever sees right-now). This is the recommended/default option in the `/import` UI. |

**A fourth export exists and is deliberately NOT built into a feature:**
"Orders (All)" — currently pending/working orders, would reveal symbols not
yet entered as trades. Discussed with the user as a possible "planned but
not-yet-filled trades" feature; explicitly deferred, not requested. Don't
build it without the user asking.

**Open question worth resolving:** `colmexPositions/` and
`colmexOrderHistory/` parse exports that come from **TradingView's own
trading-panel UI**, not from Colmex's backend directly - and TradingView
standardizes that panel's export format across every broker it integrates
with. So these two importers may already work for *any* TradingView-
connected broker, not just Colmex, despite the "colmex..." folder names -
unverified, since we've only ever tested against real Colmex Pro samples.
`colmex/` (the original "Filled orders" import) is different: that's
Colmex's own terminal's proprietary format, genuinely Colmex-specific. If
a user brings a real export from a different TradingView-connected broker,
try it against `colmexOrderHistory`'s parser as-is before writing a new
importer - it may just work. If it does, worth renaming the id/folder to
something broker-neutral (e.g. `tradingViewOrderHistory`) - but do that
deliberately, since the broker id is already stored on real `csv_imports`/
`trades` rows.

Grouping trusts each broker's own reported realized P&L per closing fill
(no FIFO cost-basis reimplementation) — see `docs/project-plan.md`'s
"Colmex CSV format" section for the full reasoning and the `entryKnown:
false` partial-export edge case.

## Timezone handling (`lib/time.ts`)

- CSV wall-clock timestamps (broker's local time, unknown to us) →
  real UTC via `zonedWallTimeToUtc`, given a user-supplied source timezone
  (defaults to the browser's, editable on the import screen).
- Anything analyzing "time of day" / "which trading day" always reads back
  via `easternParts` (hardcoded US/Eastern — the market's own clock),
  regardless of the *viewer's* timezone. Never use the viewer's local time
  for this kind of analysis.
- `addIsoDays(isoDate, days)` is the one shared pure calendar-arithmetic
  helper (UTC-anchored, not tied to any wall clock) — used by the
  diagnosis lookforward window and the review-chart date range. If you need
  "N days from this date" logic anywhere else, use this instead of writing
  another local copy (there were three near-identical copies before this
  got consolidated).

## Two separate charts — don't conflate them

- **`components/TradingViewWidget.tsx`** — TradingView's free "Advanced
  Chart" embeddable widget. Display-only; there is no TradingView API to
  pull data from. The user explicitly asked to *keep* this (declined an
  offer to replace it with a self-built chart) — just make it render
  correctly. Sizing was a recurring live bug across **five** PR attempts
  (container width → zoom-range defaults → fixed height → DOM structure →
  finally: computing an explicit pixel height from `window.innerHeight` at
  mount, abandoning `autosize`/CSS entirely). The last fix is deployed but
  **never confirmed working live** — this sandbox cannot render/screenshot
  the app. If the user reports it's still wrong, stop guessing at more CSS
  fixes and ask for a live screenshot with browser dev tools open on the
  widget's actual `<iframe>` so you can see its real computed size.
- **`components/TradeReviewChart.tsx`** — a separate, self-built chart
  (Recharts + Stooq data) on the trade detail page. Daily/Weekly/Monthly
  toggle, with the trade's entry/exit/planned-stop/planned-target drawn as
  reference lines over real price bars — a visual "did this play out the
  way I planned" view. This is *additional* to the TradingView widget, not
  a replacement.

## Price data sources — two, for different jobs

- **`lib/quotes/finnhub.ts`** — current-price quotes only (free tier blocks
  historical/candle data with a 403). Used only for unrealized P&L on open
  positions.
- **`lib/quotes/stooq.ts`** — free historical daily/weekly/monthly OHLC, no
  API key. Backs three features: the dashboard's S&P 500 overlay, the
  post-trade diagnosis checks, and the trade review chart.
  **This sandbox's network egress blocks stooq.com entirely** — every
  Stooq-backed feature has only ever been verified against synthetic data
  in `scripts/verify-*.ts`, never a real response, in this environment.
  A live bug already surfaced from this (diagnosis returned "No price
  history available" for a valid symbol) — the likely cause (a plain
  server fetch reading as a bot without browser-like headers) was fixed by
  adding a `User-Agent`/`Accept` header, and every failure path now
  `console.error`s a reason instead of silently collapsing to `null`. This
  fix is deployed but **not confirmed to have resolved the actual issue** —
  if it recurs, check Vercel's function logs first; they'll now say why.

## Post-trade diagnosis (`lib/analytics/postTradeDiagnosis.ts`)

Deliberately scoped to **swing trading** (holds of days/weeks), not
day-trading — confirmed directly by the user. Daily-bar resolution, a
30-day post-exit lookforward window.

**Only runs on trades that had both `planned_stop` and `planned_target` set
from the start.** This was an explicit correction from the user: "a mistake
only means something relative to a plan that existed" — a trade with no
plan is skipped with a reason, never guessed at. This gating happens in the
caller (`app/actions/diagnostics.ts`), keeping the pure function's
contract simple (both levels are required, non-optional inputs).

Finding kinds, in the order they're checked:
1. `target_reachable_not_captured` — target was touched while the trade was
   still open, but the exit didn't capture it.
2. `continued_after_exit` — price moved ≥2% further favorable in the 30
   days after exit.
3. `recovered_after_stop` — a losing trade whose stock later recovered back
   past entry (sometimes past the original target too).
4. `premature_exit_missed_target` / `premature_exit_dodged_stop` /
   `premature_exit_ambiguous` — **the main one, built from a specific user
   scenario**: for a trade closed by manual exit (exit price landed
   between the stop and target, not near either — see `nearLevel`'s
   tolerance), simulates forward from the exit date to see which planned
   level would have been hit first. Ambiguous when both fall in the same
   day's range (daily bars can't resolve intraday order).

Surfaced two ways now (both go through the same `diagnoseOne` helper in
`app/actions/diagnostics.ts`, so on-demand and auto-surfaced results agree):
- On-demand: the Journal page's multi-select "Diagnose selected" action
  (`components/JournalTable.tsx`).
- Auto-surfaced: `getMaturedReviews()` — once a closed trade (with a full
  plan) is ~30 days past its exit, its diagnosis is generated automatically
  and shown in `components/TradeReviewsPanel.tsx` at the top of the Journal
  page until dismissed (`markReviewsViewed`). In-app only, no email/push —
  deliberately pull-based (generated lazily whenever the Journal page loads
  and notices a newly-matured trade) rather than a scheduled job, since
  this stack has no cron/background-worker infra. `diagnosis` /
  `diagnosis_generated_at` / `diagnosis_viewed_at` on `trades` persist the
  result so it's not recomputed (repeat Stooq calls) on every visit, and so
  "seen" state is trackable. A trade whose diagnosis actually completed
  (bars fetched, checks ran) is the only case that gets persisted — a
  structural skip (still open, no plan yet, symbol's history unavailable
  right now) deliberately leaves `diagnosis_generated_at` null so it's
  retried later instead of getting permanently stuck unreviewed. Editing a
  trade's exit price/time or planned stop/target after a diagnosis exists
  clears the persisted diagnosis (`app/actions/trades.ts`'s
  `updateTrade`), since it was computed from now-stale inputs.

This pairs with two new freeform fields on `trades`: `thesis` (already
existed — "why I entered") and `exit_reason` (new — "why I exited at this
price"), shown together on the trade detail page and in each review card,
next to the plan (`entry_price` → `planned_stop`/`planned_target` →
`exit_price`) they're supposed to explain. Kept as plain freeform text
(not structured/guided prompts) — a deliberate scope call, not an
oversight; revisit if free text turns out too inconsistent to be useful
once there's more data.

### Discussed but not yet built (the user asked for more scenarios; these were proposed, not requested outright)

These need a **new aggregate/cross-trade view** — the existing Diagnosis
panel only ever looks at one trade at a time, and these patterns are only
visible across many trades:
- Revenge trading / overtrading (clustered same-symbol trades right after a
  loss, especially with increasing size).
- Cutting winners short vs. letting losers run (the "disposition effect") —
  compare average winning trade size vs. average losing trade size.
- Time-of-day win rate (the `easternParts` data is already there).
- Counter-trend entries (compare entry side against the stock's own recent
  trend using the same Stooq bars).
- Inconsistent position sizing (money-at-risk variance trade to trade).

Also discussed: having each finding suggest a one-click `mistake_tags`
entry (the column already exists on `trades`) so findings accumulate into
a "your costliest recurring mistakes" dashboard stat over time. Not built.

## Journal page bulk actions (`components/JournalTable.tsx`)

Checkbox per row + a header "select all" reveal a toolbar: **Diagnose
selected**, **Set strategy…** (bulk-tags the free-text `strategy_tag`
field — added because CSV-imported trades never have this filled in, and
editing trades one at a time to add it was too slow), **Delete selected**
(confirms before deleting, useful for cleaning out noise). Backing actions
in `app/actions/trades.ts`: `deleteTrades(ids)`, `setStrategyForTrades(ids,
tag)` — both scoped to `user_id`, never trust RLS alone.

## Working conventions in this repo

- **Branch per feature/fix off `main`**, PR via the GitHub MCP tools, merge
  once Vercel's deploy check goes green (Vercel is the only CI configured —
  there's no separate test-runner check). Delete the local branch after
  pulling `main`.
- **`npm run lint` and `npm run build` clean, always, before pushing.**
- **This repo has no automated test suite.** Instead, any pure/risky logic
  gets a `scripts/verify-*.ts` script (run via `npx tsx scripts/verify-....
  ts`), checked in permanently as the closest thing to a regression test.
  Keep this pattern — write one for new pure logic before shipping it.
- **This sandbox's network egress is blocked** to essentially all external
  hosts (Stooq, and presumably anything else outside the GitHub/Vercel/
  Supabase API surface already wired up). Anything that makes an external
  HTTP call can only be verified against synthetic data here — say so
  explicitly when shipping such a change, and expect the user to be the one
  who actually exercises it live.
- **PRs in this project are self-merged** (no human reviewer in the loop)
  once the Vercel check passes — this has been the established flow for
  every PR so far. Continue it unless the user says otherwise.
- Every commit/PR carries the attribution footer/trailer required by the
  session's system prompt at the time — check the current one rather than
  assuming the exact wording from an old commit.

## Known open items

- TradingView widget sizing (5th attempt) — unverified live, see above.
- Stooq fetch headers/logging fix — unverified live, see above. If the
  KEYS-style "No price history available" bug recurs, check Vercel logs.
- No aggregate/cross-trade analytics view yet (see "Discussed but not yet
  built" above) — this is the natural next step if the user wants to keep
  going on the "help users learn their mistakes" thread.
- Whether `colmexPositions`/`colmexOrderHistory` already work for
  non-Colmex TradingView-connected brokers — see the "Open question" under
  "Import pipeline" above.
- Diagnosis skip message UX: when a trade is skipped for having no
  planned_stop/planned_target, the skip reason (`app/actions/
  diagnostics.ts`) is currently just flat text with no next step. The user
  suggested it should point them toward fixing it - e.g. "sync via
  Positions" (open trades) or "re-import via Order History" (closed
  trades, since that backfills planned levels retroactively) - rather than
  just saying "nothing to compare it against." Small, well-scoped UI
  change; not yet built.
- Auto-surfaced trade reviews (`TradeReviewsPanel`, see "Post-trade
  diagnosis" above) are new and unverified live for the same reason as the
  rest of the Stooq-backed features — this sandbox can't reach stooq.com,
  so the generation path (`getMaturedReviews`) has only been exercised via
  `npm run build`'s type-checking, not a real matured trade. Also: nothing
  in this repo has a trade old enough yet to hit the 30-day maturity
  window live — the first real signal on this will come whenever the
  user's oldest post-launch closed trade crosses that mark.
