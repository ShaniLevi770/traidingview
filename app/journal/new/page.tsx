"use client";

import { useActionState } from "react";
import { createTrade } from "@/app/actions/trades";

const inputClass = "rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900";
const labelClass = "flex flex-col gap-1 text-sm";

export default function NewTradePage() {
  const [state, action, pending] = useActionState(createTrade, undefined);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Add a trade</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Fill in what you planned (stop/target) as well as what happened — that&apos;s what makes this a learning journal, not just a log.
      </p>

      <form action={action} className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Execution</legend>
          <div className="grid grid-cols-2 gap-4">
            <label className={labelClass}>
              Symbol
              <input name="symbol" required placeholder="AAPL" className={inputClass} />
            </label>
            <label className={labelClass}>
              Side
              <select name="side" className={inputClass} defaultValue="long">
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </label>
            <label className={labelClass}>
              Quantity
              <input name="quantity" type="number" step="any" required className={inputClass} />
            </label>
            <label className={labelClass}>
              Fees
              <input name="fees" type="number" step="any" defaultValue={0} className={inputClass} />
            </label>
            <label className={labelClass}>
              Entry price
              <input name="entry_price" type="number" step="any" required className={inputClass} />
            </label>
            <label className={labelClass}>
              Entry date/time
              <input name="entry_time" type="datetime-local" required className={inputClass} />
            </label>
            <label className={labelClass}>
              Exit price <span className="text-zinc-400">(leave blank if still open)</span>
              <input name="exit_price" type="number" step="any" className={inputClass} />
            </label>
            <label className={labelClass}>
              Exit date/time
              <input name="exit_time" type="datetime-local" className={inputClass} />
            </label>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Risk plan <span className="text-zinc-400">(optional, but this is the point)</span>
          </legend>
          <div className="grid grid-cols-2 gap-4">
            <label className={labelClass}>
              Planned stop
              <input name="planned_stop" type="number" step="any" className={inputClass} />
            </label>
            <label className={labelClass}>
              Planned target
              <input name="planned_target" type="number" step="any" className={inputClass} />
            </label>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Context</legend>
          <div className="grid grid-cols-2 gap-4">
            <label className={labelClass}>
              Strategy / setup
              <input name="strategy_tag" className={inputClass} />
            </label>
            <label className={labelClass}>
              Followed my plan?
              <select name="followed_plan" className={inputClass} defaultValue="">
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>
          <label className={labelClass}>
            Mistake tags <span className="text-zinc-400">(comma-separated, e.g. &quot;FOMO entry, moved stop&quot;)</span>
            <input name="mistake_tags" className={inputClass} />
          </label>
          <label className={labelClass}>
            Thesis / setup reasoning
            <textarea name="thesis" rows={2} className={inputClass} />
          </label>
          <label className={labelClass}>
            Notes
            <textarea name="notes" rows={3} className={inputClass} />
          </label>
          <label className={labelClass}>
            Screenshot
            <input name="screenshot" type="file" accept="image/*" className={inputClass} />
          </label>
        </fieldset>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="self-start rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {pending ? "Saving…" : "Save trade"}
        </button>
      </form>
    </div>
  );
}
