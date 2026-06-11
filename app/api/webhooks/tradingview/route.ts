import { NextResponse } from "next/server";
import { getDb, id } from "@/lib/db";
import {
  extractTradingViewPnlState,
  mapTradingViewAlert,
  normalizeTradingViewPayload,
  validateTradingViewSecret,
  type TradingViewAlertRow
} from "@/lib/tradingview";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = (await request.json()) as Record<string, unknown>;

  if (!validateTradingViewSecret(request, payload)) {
    return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
  }

  const normalized = normalizeTradingViewPayload(payload);
  const db = getDb();
  const alertId = id("tv");

  db.prepare(
    `INSERT INTO tradingview_alerts
      (id, symbol, timeframe, action, price, message, raw_payload, screenshot_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    alertId,
    normalized.symbol,
    normalized.timeframe,
    normalized.action,
    normalized.price,
    normalized.message,
    JSON.stringify(payload),
    normalized.screenshotUrl || null
  );

  const pnlState = extractTradingViewPnlState(payload, normalized, alertId);
  if (pnlState) {
    db.prepare(
      `INSERT INTO tradingview_pnl_state
        (id, symbol, today_points, today_pnl, week_points, week_pnl, trades, win_rate, mfe, mae, source_alert_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
        symbol = excluded.symbol,
        today_points = COALESCE(NULLIF(excluded.today_points, ''), tradingview_pnl_state.today_points),
        today_pnl = COALESCE(NULLIF(excluded.today_pnl, ''), tradingview_pnl_state.today_pnl),
        week_points = COALESCE(NULLIF(excluded.week_points, ''), tradingview_pnl_state.week_points),
        week_pnl = COALESCE(NULLIF(excluded.week_pnl, ''), tradingview_pnl_state.week_pnl),
        trades = COALESCE(NULLIF(excluded.trades, ''), tradingview_pnl_state.trades),
        win_rate = COALESCE(NULLIF(excluded.win_rate, ''), tradingview_pnl_state.win_rate),
        mfe = COALESCE(NULLIF(excluded.mfe, ''), tradingview_pnl_state.mfe),
        mae = COALESCE(NULLIF(excluded.mae, ''), tradingview_pnl_state.mae),
        source_alert_id = excluded.source_alert_id,
        updated_at = CURRENT_TIMESTAMP`
    ).run(
      pnlState.id,
      pnlState.symbol,
      pnlState.todayPoints,
      pnlState.todayPnl,
      pnlState.weekPoints,
      pnlState.weekPnl,
      pnlState.trades,
      pnlState.winRate,
      pnlState.mfe,
      pnlState.mae,
      pnlState.sourceAlertId || null
    );
  }

  const row = db
    .prepare("SELECT * FROM tradingview_alerts ORDER BY created_at DESC LIMIT 1")
    .get() as TradingViewAlertRow;

  return NextResponse.json({
    alert: mapTradingViewAlert(row),
    pnlState: Boolean(pnlState),
    ok: true,
    received: normalized
  });
}
