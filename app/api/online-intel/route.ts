import { NextResponse } from "next/server";
import { getOnlineIntel } from "@/lib/online-intel";

export async function POST(request: Request) {
  const body = (await request.json()) as { query?: string };
  const query = body.query?.trim();

  if (!query) {
    return NextResponse.json({ error: "Query is required." }, { status: 400 });
  }

  const intel = await getOnlineIntel(query);

  return NextResponse.json({
    intel: intel || {
      kind: "none",
      query,
      summary: "No online lookup was needed for that request."
    }
  });
}
