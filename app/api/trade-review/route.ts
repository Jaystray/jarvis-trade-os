import { NextResponse } from "next/server";
import { analyzeTradeReview } from "@/lib/openai";
import { getRelevantMemories } from "@/lib/retrieval";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    notes?: string;
    imageDataUrl?: string;
  };

  if (!body.notes?.trim() && !body.imageDataUrl) {
    return NextResponse.json(
      { error: "Trade notes or a chart screenshot is required." },
      { status: 400 }
    );
  }

  const memoryQuery = [body.notes || "", "APEX MNQ 15 second chart risk stop setup"].join(" ");
  const memories = getRelevantMemories(memoryQuery, 6);
  const review = await analyzeTradeReview({
    notes: body.notes || "",
    imageDataUrl: body.imageDataUrl,
    memories
  });

  return NextResponse.json({ review, memories });
}
