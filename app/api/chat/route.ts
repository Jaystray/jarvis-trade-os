import { NextResponse } from "next/server";
import { getDb, id } from "@/lib/db";
import { detectLaunchIntent, launchLocalTarget } from "@/lib/local-launch";
import { getOnlineIntel } from "@/lib/online-intel";
import { generateAssistantReply } from "@/lib/openai";
import { getRelevantMemories } from "@/lib/retrieval";
import type { ChatMessage } from "@/types";

type MessageRow = {
  id: string;
  session_id: string;
  role: ChatMessage["role"];
  content: string;
  created_at: string;
};

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at
  };
}

function autoMemory(input: string) {
  const match = input.match(/^remember that\s+(.+)/i) || input.match(/^remember\s+(.+)/i);
  if (!match?.[1]) return null;
  const content = match[1].trim();
  return {
    title: content.length > 54 ? `${content.slice(0, 54)}...` : content,
    content
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId") || "default";
  const db = getDb();

  db.prepare("INSERT OR IGNORE INTO sessions (id, title) VALUES (?, ?)").run(
    sessionId,
    "Primary Session"
  );

  const rows = db
    .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 80")
    .all(sessionId) as MessageRow[];

  return NextResponse.json({ messages: rows.map(mapMessage) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    message?: string;
    persist?: boolean;
  };
  const sessionId = body.sessionId || "default";
  const message = body.message?.trim();
  const persist = body.persist !== false;

  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO sessions (id, title) VALUES (?, ?)").run(
    sessionId,
    "Primary Session"
  );

  const memory = autoMemory(message);
  if (memory) {
    db.prepare("INSERT INTO memories (id, title, content, tags) VALUES (?, ?, ?, ?)").run(
      id("mem"),
      memory.title,
      memory.content,
      JSON.stringify(["manual", "chat"])
    );
  }

  const launchTargetId = detectLaunchIntent(message);
  const localLaunch = launchTargetId ? await launchLocalTarget(launchTargetId) : null;
  const relevantMemories = getRelevantMemories(message);
  const onlineIntel = await getOnlineIntel(message);
  const reply = localLaunch
    ? localLaunch.message
    : await generateAssistantReply(message, relevantMemories, onlineIntel);

  if (!persist) {
    return NextResponse.json({
      messages: [
        {
          id: id("voice"),
          sessionId,
          role: "assistant",
          content: reply,
          createdAt: new Date().toISOString()
        }
      ],
      localLaunch,
      memories: relevantMemories,
      onlineIntel,
      savedMemory: Boolean(memory)
    });
  }

  const userMessageId = id("msg");
  db.prepare("INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)").run(
    userMessageId,
    sessionId,
    "user",
    message
  );

  const assistantMessageId = id("msg");
  db.prepare("INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)").run(
    assistantMessageId,
    sessionId,
    "assistant",
    reply
  );

  const rows = db
    .prepare("SELECT * FROM messages WHERE id IN (?, ?) ORDER BY created_at ASC")
    .all(userMessageId, assistantMessageId) as MessageRow[];

  return NextResponse.json({
    localLaunch,
    messages: rows.map(mapMessage),
    memories: relevantMemories,
    onlineIntel,
    savedMemory: Boolean(memory)
  });
}
