import { NextResponse } from "next/server";
import { getHighImpactEconomicEvents } from "@/lib/economic-calendar";

const finvizCalendarUrl = "https://finviz.com/calendar.ashx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await getHighImpactEconomicEvents();

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
