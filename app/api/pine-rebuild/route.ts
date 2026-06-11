import { NextResponse } from "next/server";
import { getDb, id } from "@/lib/db";
import { generatePineRebuild } from "@/lib/openai";
import { getRelevantMemories } from "@/lib/retrieval";
import type { ChartWatchLog, PineRebuild, WorkspaceNote } from "@/types";

type PineRebuildRow = {
  id: string;
  title: string;
  input_script: string;
  issue_notes: string;
  output: string;
  created_at: string;
};

type ChartWatchRow = {
  id: string;
  status: ChartWatchLog["status"];
  summary: string;
  analysis: string;
  image_data_url?: string;
  created_at: string;
};

type NoteRow = {
  id: string;
  section: string;
  title: string;
  content: string;
  created_at: string;
};

function mapRebuild(row: PineRebuildRow): PineRebuild {
  return {
    id: row.id,
    title: row.title,
    inputScript: row.input_script,
    issueNotes: row.issue_notes,
    output: row.output,
    createdAt: row.created_at
  };
}

function mapChartLog(row: ChartWatchRow): ChartWatchLog {
  return {
    id: row.id,
    status: row.status,
    summary: row.summary,
    analysis: row.analysis,
    imageDataUrl: row.image_data_url,
    createdAt: row.created_at
  };
}

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
    .prepare("SELECT * FROM pine_rebuilds ORDER BY created_at DESC LIMIT 30")
    .all() as PineRebuildRow[];
  return NextResponse.json({ rebuilds: rows.map(mapRebuild) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    currentScript?: string;
    issueNotes?: string;
  };
  const currentScript = body.currentScript?.trim() || "";
  const issueNotes = body.issueNotes?.trim() || "";

  if (!currentScript && !issueNotes) {
    return NextResponse.json(
      { error: "Current script or issue notes are required." },
      { status: 400 }
    );
  }

  const db = getDb();
  const chartRows = db
    .prepare("SELECT * FROM chart_watch_logs ORDER BY created_at DESC LIMIT 10")
    .all() as ChartWatchRow[];
  const reviewRows = db
    .prepare(
      "SELECT * FROM workspace_notes WHERE section = ? ORDER BY created_at DESC LIMIT 6"
    )
    .all("Trade Review Notes") as NoteRow[];

  const title = body.title?.trim() || "APEX Pine rebuild";
  const memories = getRelevantMemories(
    [title, currentScript, issueNotes, "APEX MNQ 15 second Pine Script chart watcher"].join(" "),
    10
  );
  const output = await generatePineRebuild({
    title,
    currentScript,
    issueNotes,
    memories,
    chartLogs: chartRows.map(mapChartLog),
    tradeReviews: reviewRows.map(mapNote)
  });

  db.prepare(
    "INSERT INTO pine_rebuilds (id, title, input_script, issue_notes, output) VALUES (?, ?, ?, ?, ?)"
  ).run(id("pine"), title, currentScript, issueNotes, output);

  const rows = db
    .prepare("SELECT * FROM pine_rebuilds ORDER BY created_at DESC LIMIT 30")
    .all() as PineRebuildRow[];

  return NextResponse.json({ output, rebuilds: rows.map(mapRebuild), memories });
}
