import { NextResponse } from "next/server";
import { getDb, id } from "@/lib/db";
import { listMemories } from "@/lib/retrieval";

export async function GET() {
  return NextResponse.json({ memories: listMemories(30) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { title?: string; content?: string; tags?: string[] };
  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "Memory content is required." }, { status: 400 });
  }

  const title = body.title?.trim() || (content.length > 54 ? `${content.slice(0, 54)}...` : content);
  getDb()
    .prepare("INSERT INTO memories (id, title, content, tags) VALUES (?, ?, ?, ?)")
    .run(id("mem"), title, content, JSON.stringify(body.tags || ["manual"]));

  return NextResponse.json({ memories: listMemories(30) });
}
