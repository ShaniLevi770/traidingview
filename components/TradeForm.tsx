"use client";

import { useActionState } from "react";
import type { TradeFormState } from "@/app/actions/trades";
import type { TradeRow } from "@/types/database";

const inputClass = "rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900";
const labelClass = "flex flex-col gap-1 text-sm";

/** Converts a stored ISO timestamp to the local value a <input type="datetime-local"> expects. */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TradeForm({
  action,
  trade,
  submitLabel,
}: {
  action: (state: TradeFormState, formData: FormData) => Promise<TradeFormState>;
  /** Existing trade to prefill, for editing. Omit for a blank "add trade" form. */
  trade?: TradeRow;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const entryUnknown = trade && !trade.entry_known;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Execution</legend>
        <div className="grid grid-cols-2 gap-4">
          <label className={labelClass}>
            Symbol
            <input name="symbol" required placeholder="AAPL" defaultValue={trade?.symbol} className={inputClass} />
          </label>
          <label className={labelClass}>
            Side
            <select name="side" className={inputClass} defaultValue={trade?.side ?? "long"}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </label>
          <label className={labelClass}>
            Quantity
            <input name="quantity" type="number" step="any" required defaultValue={trade?.quantity} className={inputClass} />
          </label>
          <label className={labelClass}>
            Fees
            <input name="fees" type="number" step="any" defaultValue={trade?.fees ?? 0} className={inputClass} />
          </label>
          <label className={labelClass}>
            Entry price {entryUnknown && <span className="text-amber-600">(unknown - partial CSV import)</span>}
            <input
              name="entry_price"
              type="number"
              step="any"
              required={!trade} // required when adding a trade; optional when editing (see EditTradeSchema)
              defaultValue={trade?.entry_price ?? undefined}
              placeholder={entryUnknown ? "unknown" : undefined}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Entry date/time
            <input
              name="entry_time"
              type="datetime-local"
              required={!trade}
              defaultValue={toDatetimeLocal(trade?.entry_time)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Exit price <span className="text-zinc-400">(leave blank if still open)</span>
            <input name="exit_price" type="number" step="any" defaultValue={trade?.exit_price ?? undefined} className={inputClass} />
          </label>
          <label className={labelClass}>
            Exit date/time
            <input name="exit_time" type="datetime-local" defaultValue={toDatetimeLocal(trade?.exit_time)} className={inputClass} />
          </label>
        </div>
        {entryUnknown && (
          <p className="text-xs text-zinc-500">
            This trade&apos;s opening fill wasn&apos;t in your imported CSV, so entry price/date are unknown - the P&amp;L
            shown is still Colmex&apos;s own reported figure. Leave entry price blank to keep it that way, or fill it in if
            you know it.
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Risk plan <span className="text-zinc-400">(optional, but this is the point)</span>
        </legend>
        <div className="grid grid-cols-2 gap-4">
          <label className={labelClass}>
            Planned stop
            <input name="planned_stop" type="number" step="any" defaultValue={trade?.planned_stop ?? undefined} className={inputClass} />
          </label>
          <label className={labelClass}>
            Planned target
            <input name="planned_target" type="number" step="any" defaultValue={trade?.planned_target ?? undefined} className={inputClass} />
          </label>
        </div>
        <label className={labelClass}>
          Expected time to target <span className="text-zinc-400">(e.g. &quot;2-3 days&quot;, &quot;a few hours&quot;)</span>
          <input name="expected_duration" defaultValue={trade?.expected_duration ?? undefined} className={inputClass} />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Context</legend>
        <div className="grid grid-cols-2 gap-4">
          <label className={labelClass}>
            Strategy / setup
            <input name="strategy_tag" defaultValue={trade?.strategy_tag ?? undefined} className={inputClass} />
          </label>
          <label className={labelClass}>
            Followed my plan?
            <select
              name="followed_plan"
              className={inputClass}
              defaultValue={trade?.followed_plan === true ? "yes" : trade?.followed_plan === false ? "no" : ""}
            >
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
        <label className={labelClass}>
          Mistake tags <span className="text-zinc-400">(comma-separated, e.g. &quot;FOMO entry, moved stop&quot;)</span>
          <input name="mistake_tags" defaultValue={trade?.mistake_tags?.join(", ")} className={inputClass} />
        </label>
        <label className={labelClass}>
          Thesis / setup reasoning
          <textarea name="thesis" rows={2} defaultValue={trade?.thesis ?? undefined} className={inputClass} />
        </label>
        <label className={labelClass}>
          Notes
          <textarea name="notes" rows={3} defaultValue={trade?.notes ?? undefined} className={inputClass} />
        </label>
        <label className={labelClass}>
          Screenshot {trade?.screenshot_url && <span className="text-zinc-400">(uploading a new one replaces the current one)</span>}
          <input name="screenshot" type="file" accept="image/*" className={inputClass} />
        </label>
      </fieldset>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
