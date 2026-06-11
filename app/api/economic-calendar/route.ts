import { NextResponse } from "next/server";

type FinvizCalendarEntry = {
  actual?: string | null;
  date?: string;
  event?: string;
  forecast?: string | null;
  importance?: number;
  previous?: string | null;
};

const finvizCalendarUrl = "https://finviz.com/calendar.ashx";

export const runtime = "nodejs";

export async function GET() {
  try {
    const res = await fetch(finvizCalendarUrl, {
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
      }
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Finviz calendar request failed with ${res.status}.`, events: [] },
        { status: 502 }
      );
    }

    const html = await res.text();
    const events = extractFinvizEntries(html)
      .filter((entry) => entry.importance === 3 && isThisEasternWeek(entry.date || ""))
      .map(mapCalendarEntry);

    return NextResponse.json({
      events,
      source: finvizCalendarUrl,
      refreshedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Economic calendar lookup failed.",
        events: []
      },
      { status: 500 }
    );
  }
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

function mapCalendarEntry(entry: FinvizCalendarEntry) {
  const date = entry.date || "";
  return {
    actual: entry.actual || "",
    date: formatEconomicDate(date),
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
