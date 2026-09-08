import { notFound } from "next/navigation";
import { verifySession } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { TradeForm } from "@/components/TradeForm";
import { updateTrade } from "@/app/actions/trades";

export default async function EditTradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await verifySession();
  const supabase = await createClient();

  const { data: trade } = await supabase.from("trades").select("*").eq("id", id).eq("user_id", userId).single();
  if (!trade) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">
        Edit {trade.symbol} <span className="font-normal text-zinc-500">trade</span>
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Good place to add a stop/target you didn&apos;t log at the time, or fill in the story after the fact.
      </p>
      <TradeForm action={updateTrade.bind(null, trade.id)} trade={trade} submitLabel="Save changes" />
    </div>
  );
}
