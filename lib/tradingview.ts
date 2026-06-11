import type { TradingViewAlert, TradingViewPnlState } from "@/types";

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

export type TradingViewPnlStateRow = {
  id: string;
  symbol: string;
  today_points: string;
  today_pnl: string;
  week_points: string;
  week_pnl: string;
  trades: string;
  win_rate: string;
  mfe: string;
  mae: string;
  source_alert_id?: string;
  updated_at: string;
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

export function mapTradingViewPnlState(row: TradingViewPnlStateRow): TradingViewPnlState {
  return {
    id: row.id,
    symbol: row.symbol,
    todayPoints: row.today_points,
    todayPnl: row.today_pnl,
    weekPoints: row.week_points,
    weekPnl: row.week_pnl,
    trades: row.trades,
    winRate: row.win_rate,
    mfe: row.mfe,
    mae: row.mae,
    sourceAlertId: row.source_alert_id,
    updatedAt: row.updated_at
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

export function extractTradingViewPnlState(
  payload: Record<string, unknown>,
  normalized: ReturnType<typeof normalizeTradingViewPayload>,
  sourceAlertId: string
) {
  const sourceText = `${normalized.message}\n${readPayloadValue(payload, ["analytics", "dashboard", "summary"])}`;
  const todayPoints = readMetric(payload, dayPointKeys(), sourceText, "day", "points");
  const todayPnl =
    readMetric(payload, dayDollarKeys(), sourceText, "day", "dollars") ||
    dollarsFromPoints(todayPoints);
  const weekPoints = readMetric(payload, weekPointKeys(), sourceText, "week", "points");
  const weekPnl =
    readMetric(payload, weekDollarKeys(), sourceText, "week", "dollars") ||
    dollarsFromPoints(weekPoints);
  const trades = readPayloadValue(payload, ["trades", "totalTrades", "total_trades"]) || parseSimpleMetric(sourceText, "trades");
  const winRate = readPayloadValue(payload, ["winRate", "win_rate", "win"]) || parseSimpleMetric(sourceText, "win rate");
  const mfe = readPayloadValue(payload, ["mfe"]) || parseMfeMae(sourceText, "mfe");
  const mae = readPayloadValue(payload, ["mae"]) || parseMfeMae(sourceText, "mae");

  if (!todayPoints && !todayPnl && !weekPoints && !weekPnl && !trades && !winRate && !mfe && !mae) {
    return null;
  }

  return {
    id: "current",
    symbol: normalized.symbol,
    todayPoints,
    todayPnl,
    weekPoints,
    weekPnl,
    trades,
    winRate,
    mfe,
    mae,
    sourceAlertId
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

function readMetric(
  payload: Record<string, unknown>,
  keys: string[],
  text: string,
  period: "day" | "week",
  kind: "points" | "dollars"
) {
  return readPayloadValue(payload, keys) || parseLabeledMetric(text, period, kind);
}

function dayDollarKeys() {
  return [
    "todayPnl",
    "today_pnl",
    "todayDollars",
    "today_dollars",
    "dayPnl",
    "day_pnl",
    "dailyPnl",
    "daily_pnl",
    "dashboardPnl",
    "dashboard_pnl"
  ];
}

function weekDollarKeys() {
  return [
    "weekPnl",
    "week_pnl",
    "weeklyPnl",
    "weekly_pnl",
    "weekDollars",
    "week_dollars",
    "weeklyDollars",
    "weekly_dollars"
  ];
}

function dayPointKeys() {
  return [
    "todayPoints",
    "today_points",
    "todayPts",
    "today_pts",
    "dayPoints",
    "day_points",
    "dailyPoints",
    "daily_points",
    "dashboardPoints",
    "dashboard_points"
  ];
}

function weekPointKeys() {
  return [
    "weekPoints",
    "week_points",
    "weekPts",
    "week_pts",
    "weeklyPoints",
    "weekly_points",
    "weeklyPts",
    "weekly_pts"
  ];
}

function parseLabeledMetric(text: string, period: "day" | "week", kind: "points" | "dollars") {
  const label = period === "day" ? "(?:today|day|daily)" : "(?:week|weekly)";
  const number = "(-?\\d+(?:,\\d{3})*(?:\\.\\d+)?|-?\\d+(?:\\.\\d+)?)";
  const unit = kind === "points" ? "\\s*(?:points|pts)\\b" : "\\s*\\$";

  if (kind === "points") {
    const afterLabel = text.match(new RegExp(`${label}[^\\n\\r]*?${number}${unit}`, "i"));
    if (afterLabel?.[1]) return cleanNumberText(afterLabel[1]);

    const beforeLabel = text.match(new RegExp(`${number}${unit}[^\\n\\r]*(?:${label})`, "i"));
    return beforeLabel?.[1] ? cleanNumberText(beforeLabel[1]) : "";
  }

  const afterLabel = text.match(new RegExp(`${label}[^$\\n\\r]*\\$ ?${number}`, "i"));
  if (afterLabel?.[1]) return cleanNumberText(afterLabel[1]);

  const beforeLabel = text.match(new RegExp(`\\$ ?${number}[^\\n\\r]*(?:${label})`, "i"));
  return beforeLabel?.[1] ? cleanNumberText(beforeLabel[1]) : "";
}

function parseSimpleMetric(text: string, label: string) {
  const number = "(-?\\d+(?:,\\d{3})*(?:\\.\\d+)?|-?\\d+(?:\\.\\d+)?)";
  const match = text.match(new RegExp(`${label}[^\\n\\r]*?${number}%?`, "i"));
  return match?.[1] ? cleanNumberText(match[1]) : "";
}

function parseMfeMae(text: string, side: "mfe" | "mae") {
  const number = "(-?\\d+(?:,\\d{3})*(?:\\.\\d+)?|-?\\d+(?:\\.\\d+)?)";
  const pair = text.match(new RegExp(`mfe\\s*\\/\\s*mae[^\\n\\r]*?${number}\\s*\\/\\s*${number}`, "i"));
  if (pair?.[side === "mfe" ? 1 : 2]) return cleanNumberText(pair[side === "mfe" ? 1 : 2]);
  return parseSimpleMetric(text, side);
}

function dollarsFromPoints(points: string) {
  const parsed = Number.parseFloat(points.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? cleanNumberText(String(parsed * 2)) : "";
}

function cleanNumberText(value: string) {
  const parsed = Number.parseFloat(value.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed)) return "";
  return Number.isInteger(parsed) ? String(parsed) : String(Number(parsed.toFixed(2)));
}
