import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { mapTradingViewPnlState, type TradingViewPnlStateRow } from "@/lib/tradingview";

export async function GET() {
  const row = getDb()
    .prepare("SELECT * FROM tradingview_pnl_state WHERE id = 'current' LIMIT 1")
    .get() as TradingViewPnlStateRow | undefined;

  return NextResponse.json({ pnl: row ? mapTradingViewPnlState(row) : null });
}
