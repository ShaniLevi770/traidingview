import { TradeForm } from "@/components/TradeForm";
import { createTrade } from "@/app/actions/trades";

export default function NewTradePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Add a trade</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Fill in what you planned (stop/target) as well as what happened — that&apos;s what makes this a learning journal, not just a log.
      </p>
      <TradeForm action={createTrade} submitLabel="Save trade" />
    </div>
  );
}
