import Link from "next/link";
import { getOptionalSession } from "@/lib/supabase/dal";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getOptionalSession();
  if (session) redirect("/journal");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold">A trading journal for beginners</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Log every trade, see the real TradingView chart next to it, import your
        Colmex Pro history, and learn from what you planned vs. what actually
        happened — not just your P&amp;L.
      </p>
      <div className="flex gap-3">
        <Link href="/signup" className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900">
          Sign up
        </Link>
        <Link href="/login" className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700">
          Log in
        </Link>
      </div>
    </div>
  );
}
