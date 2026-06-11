import { NextResponse } from "next/server";
import { getDb, id } from "@/lib/db";
import {
  mapTradingViewAlert,
  normalizeTradingViewPayload,
  validateTradingViewSecret,
  type TradingViewAlertRow
} from "@/lib/tradingview";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!validateTradingViewSecret(request)) {
    return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
  }

  const payload = (await request.json()) as Record<string, unknown>;
  const normalized = normalizeTradingViewPayload(payload);
  const db = getDb();

  db.prepare(
    `INSERT INTO tradingview_alerts
      (id, symbol, timeframe, action, price, message, raw_payload, screenshot_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id("tv"),
    normalized.symbol,
    normalized.timeframe,
    normalized.action,
    normalized.price,
    normalized.message,
    JSON.stringify(payload),
    normalized.screenshotUrl || null
  );

  const row = db
    .prepare("SELECT * FROM tradingview_alerts ORDER BY created_at DESC LIMIT 1")
    .get() as TradingViewAlertRow;

  return NextResponse.json({
    alert: mapTradingViewAlert(row),
    ok: true,
    received: normalized
  });
}
