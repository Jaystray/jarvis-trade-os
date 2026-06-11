import { NextResponse } from "next/server";
import { generateCodexPrompt } from "@/lib/openai";
import { getRelevantMemories } from "@/lib/retrieval";

export async function POST(request: Request) {
  const body = (await request.json()) as { request?: string };
  const changeRequest = body.request?.trim();
  if (!changeRequest) {
    return NextResponse.json({ error: "Request is required." }, { status: 400 });
  }

  const memories = getRelevantMemories(changeRequest);
  const prompt = await generateCodexPrompt(changeRequest, memories);
  return NextResponse.json({ prompt, memories });
}
