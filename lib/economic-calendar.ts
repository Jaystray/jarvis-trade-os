import type { EconomicCalendarEvent } from "@/types";

type FinvizCalendarEntry = {
  actual?: string | null;
  date?: string;
  event?: string;
  forecast?: string | null;
  importance?: number;
  previous?: string | null;
};

const finvizCalendarUrl = "https://finviz.com/calendar.ashx";

export function isEconomicCalendarQuestion(input: string) {
  return /\b(calendar|economic event|economic news|cpi|ppi|fomc|fed|nfp|payroll|inflation|jobs report)\b/i.test(
    input
  );
}

export async function getHighImpactEconomicEvents() {
  const res = await fetch(finvizCalendarUrl, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
    }
  });

  if (!res.ok) {
    throw new Error(`Finviz calendar request failed with ${res.status}.`);
  }

  const html = await res.text();
  return extractFinvizEntries(html)
    .filter((entry) => entry.importance === 3 && isThisEasternWeek(entry.date || ""))
    .map(mapCalendarEntry);
}

export function formatEconomicCalendarReply(events: EconomicCalendarEvent[], query: string) {
  const today = getEasternDateKey(new Date());
  const wantsToday = /\b(today|this morning|this afternoon|tonight|now)\b/i.test(query);
  const relevantEvents = wantsToday
    ? events.filter((event) => event.dateKey === today)
    : events;

  if (!relevantEvents.length) {
    return wantsToday
      ? "There are no high-impact economic events left on today's Finviz calendar."
      : "There are no high-impact economic events on this week's Finviz calendar.";
  }

  const scope = wantsToday ? "Today" : "This week";
  const eventLines = relevantEvents.slice(0, 6).map((event) => {
    const values = [
      event.forecast ? `forecast ${event.forecast}` : "",
      event.previous ? `previous ${event.previous}` : "",
      event.actual ? `actual ${event.actual}` : ""
    ]
      .filter(Boolean)
      .join(", ");
    return `${event.date} at ${event.time} ET: ${event.eventName}${values ? `, ${values}` : ""}.`;
  });

  return [
    `${scope}'s high-impact economic calendar has ${relevantEvents.length} event${relevantEvents.length === 1 ? "" : "s"}.`,
    ...eventLines,
    "For NQ and ES, mark these times as volatility windows and avoid fresh entries right into the release."
  ].join(" ");
}

function extractFinvizEntries(html: string): FinvizCalendarEntry[] {
  const match = html.match(
    /<script\s+id=["']route-init-data["']\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i
  );
  if (!match?.[1]) throw new Error("Finviz calendar data was not found.");

  const parsed = JSON.parse(decodeHtml(match[1])) as {
    data?: { entries?: FinvizCalendarEntry[] };
  };

  return Array.isArray(parsed.data?.entries) ? parsed.data.entries : [];
}

function mapCalendarEntry(entry: FinvizCalendarEntry): EconomicCalendarEvent {
  const date = entry.date || "";
  return {
    actual: entry.actual || "",
    date: formatEconomicDate(date),
    dateKey: date.slice(0, 10),
    eventName: entry.event || "Economic event",
    forecast: entry.forecast || "",
    impactLevel: "high",
    previous: entry.previous || "",
    time: formatEconomicTime(date)
  };
}

function isThisEasternWeek(value: string) {
  const dateKey = value.slice(0, 10);
  if (!dateKey) return false;

  const current = getEasternDateParts(new Date());
  const currentUtc = Date.UTC(current.year, current.month - 1, current.day);
  const weekday = new Date(currentUtc).getUTCDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  const start = currentUtc - daysFromMonday * 86_400_000;
  const end = start + 6 * 86_400_000;

  const [year, month, day] = dateKey.split("-").map(Number);
  const eventUtc = Date.UTC(year, month - 1, day);
  return eventUtc >= start && eventUtc <= end;
}

function getEasternDateKey(date: Date) {
  const parts = getEasternDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getEasternDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/New_York",
    year: "numeric"
  }).formatToParts(date);

  return {
    day: Number(parts.find((part) => part.type === "day")?.value || 1),
    month: Number(parts.find((part) => part.type === "month")?.value || 1),
    year: Number(parts.find((part) => part.type === "year")?.value || 1970)
  };
}

function formatEconomicDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    weekday: "short"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatEconomicTime(value: string) {
  const match = value.match(/T(\d{2}):(\d{2})/);
  if (!match) return "All Day";
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
