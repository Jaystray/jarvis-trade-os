import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { mapTradingViewAlert, type TradingViewAlertRow } from "@/lib/tradingview";

export async function GET() {
  const rows = getDb()
    .prepare("SELECT * FROM tradingview_alerts ORDER BY created_at DESC LIMIT 300")
    .all() as TradingViewAlertRow[];

  return NextResponse.json({ alerts: rows.map(mapTradingViewAlert) });
}
