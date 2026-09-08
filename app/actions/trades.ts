"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { verifySession } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { uploadScreenshot } from "@/lib/supabase/storage";
import type { Side } from "@/types/database";

const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number().optional(),
);

const TradeSchema = z
  .object({
    symbol: z.string().trim().min(1).toUpperCase(),
    side: z.enum(["long", "short"]),
    quantity: z.coerce.number().positive(),
    entry_price: z.coerce.number(),
    entry_time: z.string().min(1), // datetime-local value, interpreted as the browser's local time
    exit_price: optionalNumber,
    exit_time: z.string().optional(),
    fees: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().default(0)),
    planned_stop: optionalNumber,
    planned_target: optionalNumber,
    strategy_tag: z.string().trim().optional(),
    mistake_tags: z.string().optional(), // comma-separated input, split below
    followed_plan: z.enum(["yes", "no", ""]).optional(),
    notes: z.string().optional(),
    thesis: z.string().optional(),
  })
  .refine((data) => (data.exit_price == null) === (!data.exit_time), {
    message: "Provide both an exit price and exit date, or neither (still open).",
  });

export type TradeFormState = { error?: string } | undefined;

function computePnl(side: Side, entry: number, exit: number, qty: number, fees: number): number {
  const gross = (side === "long" ? exit - entry : entry - exit) * qty;
  return gross - fees;
}

export async function createTrade(_prevState: TradeFormState, formData: FormData): Promise<TradeFormState> {
  const { userId } = await verifySession();

  const parsed = TradeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const isClosed = d.exit_price != null && d.exit_time;
  const pnl = isClosed ? computePnl(d.side, d.entry_price, d.exit_price!, d.quantity, d.fees) : null;

  let screenshot_url: string | null = null;
  const screenshotFile = formData.get("screenshot");
  if (screenshotFile instanceof File && screenshotFile.size > 0) {
    screenshot_url = await uploadScreenshot(userId, screenshotFile);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("trades").insert({
    user_id: userId,
    symbol: d.symbol,
    side: d.side,
    quantity: d.quantity,
    entry_price: d.entry_price,
    entry_time: new Date(d.entry_time).toISOString(),
    exit_price: d.exit_price ?? null,
    exit_time: d.exit_time ? new Date(d.exit_time).toISOString() : null,
    fees: d.fees,
    pnl,
    status: isClosed ? "closed" : "open",
    planned_stop: d.planned_stop ?? null,
    planned_target: d.planned_target ?? null,
    strategy_tag: d.strategy_tag || null,
    mistake_tags: d.mistake_tags ? d.mistake_tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    followed_plan: d.followed_plan === "yes" ? true : d.followed_plan === "no" ? false : null,
    notes: d.notes || null,
    thesis: d.thesis || null,
    screenshot_url,
    source: "manual",
  });

  if (error) return { error: error.message };

  revalidatePath("/journal");
  redirect("/journal");
}

export async function deleteTrade(tradeId: string) {
  const { userId } = await verifySession();
  const supabase = await createClient();
  // RLS also enforces this, but scoping the query too avoids relying on RLS alone.
  await supabase.from("trades").delete().eq("id", tradeId).eq("user_id", userId);
  revalidatePath("/journal");
}
