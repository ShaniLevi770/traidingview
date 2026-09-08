import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/supabase/dal";
import { getQuote } from "@/lib/quotes/finnhub";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  await verifySession(); // any logged-in user may look up a quote; nothing user-specific here

  const { symbol } = await params;
  const quote = await getQuote(symbol.toUpperCase());

  if (!quote) {
    return NextResponse.json({ error: "Quote unavailable" }, { status: 404 });
  }
  return NextResponse.json(quote);
}
