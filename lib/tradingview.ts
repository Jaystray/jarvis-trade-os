import type { TradingViewAlert } from "@/types";

export type TradingViewAlertRow = {
  id: string;
  symbol: string;
  timeframe: string;
  action: string;
  price: string;
  message: string;
  raw_payload: string;
  screenshot_url?: string;
  created_at: string;
};

export function mapTradingViewAlert(row: TradingViewAlertRow): TradingViewAlert {
  return {
    id: row.id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    action: row.action,
    price: row.price,
    message: row.message,
    rawPayload: JSON.parse(row.raw_payload || "{}") as Record<string, unknown>,
    screenshotUrl: row.screenshot_url,
    createdAt: row.created_at
  };
}

function readPayloadValue(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function normalizeTradingViewPayload(payload: Record<string, unknown>) {
  const message =
    readPayloadValue(payload, ["message", "alert_message", "text", "comment"]) ||
    buildPayloadSummary(payload);

  return {
    action: readPayloadValue(payload, ["action", "side", "direction", "signal"]) || "alert",
    message,
    price: readPayloadValue(payload, ["price", "close", "entry", "entry_price"]),
    screenshotUrl: readPayloadValue(payload, ["screenshotUrl", "screenshot_url", "imageUrl", "image_url"]),
    symbol: readPayloadValue(payload, ["symbol", "ticker", "market"]) || "unknown",
    timeframe: readPayloadValue(payload, ["timeframe", "interval", "tf"]) || "unknown"
  };
}

function buildPayloadSummary(payload: Record<string, unknown>) {
  const event = readPayloadValue(payload, ["event", "grade"]);
  const setup = readPayloadValue(payload, ["setup"]);
  const direction = readPayloadValue(payload, ["direction", "action", "side", "signal"]);
  const level = readPayloadValue(payload, ["level"]);
  const ribbon = readPayloadValue(payload, ["ribbon"]);
  const strength = readPayloadValue(payload, ["ribbon_strength", "strength"]);
  const score = readPayloadValue(payload, ["score"]);
  const ttm = readPayloadValue(payload, ["ttm"]);
  const smt = readPayloadValue(payload, ["smt_read"]);

  return [
    event || "TradingView alert",
    direction,
    setup,
    level,
    ribbon ? `${ribbon}${strength ? ` ${strength}` : ""}` : "",
    score ? `score ${score}` : "",
    ttm && ttm !== "NONE" ? `TTM ${ttm}` : "",
    smt && smt !== "-" ? smt : ""
  ]
    .filter(Boolean)
    .join(" | ");
}

export function validateTradingViewSecret(request: Request, payload?: Record<string, unknown>) {
  const secret = process.env.TRADINGVIEW_WEBHOOK_SECRET?.trim();
  if (!secret && process.env.NODE_ENV !== "production") return true;
  if (!secret) return false;

  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  const headerSecret = request.headers.get("x-jarvis-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const payloadSecret = payload
    ? readPayloadValue(payload, ["secret", "password", "webhookPassword", "webhook_password"])
    : "";

  return [querySecret, headerSecret, bearer, payloadSecret].includes(secret);
}
