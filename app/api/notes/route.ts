import { NextResponse } from "next/server";
import { getDb, id } from "@/lib/db";
import type { WorkspaceNote } from "@/types";

type NoteRow = {
  id: string;
  section: string;
  title: string;
  content: string;
  created_at: string;
};

function mapNote(row: NoteRow): WorkspaceNote {
  return {
    id: row.id,
    section: row.section,
    title: row.title,
    content: row.content,
    createdAt: row.created_at
  };
}

export async function GET() {
  const rows = getDb()
    .prepare("SELECT * FROM workspace_notes ORDER BY created_at DESC LIMIT 60")
    .all() as NoteRow[];
  return NextResponse.json({ notes: rows.map(mapNote) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { section?: string; title?: string; content?: string };
  if (!body.section || !body.content) {
    return NextResponse.json({ error: "Section and content are required." }, { status: 400 });
  }

  getDb()
    .prepare("INSERT INTO workspace_notes (id, section, title, content) VALUES (?, ?, ?, ?)")
    .run(id("note"), body.section, body.title || "Untitled note", body.content);

  const rows = getDb()
    .prepare("SELECT * FROM workspace_notes ORDER BY created_at DESC LIMIT 60")
    .all() as NoteRow[];
  return NextResponse.json({ notes: rows.map(mapNote) });
}
