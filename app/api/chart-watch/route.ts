import { NextResponse } from "next/server";
import { getDb, id } from "@/lib/db";
import { analyzeChartWatch } from "@/lib/openai";
import { getRelevantMemories } from "@/lib/retrieval";
import type { ChartWatchLog } from "@/types";

type ChartWatchRow = {
  id: string;
  status: ChartWatchLog["status"];
  summary: string;
  analysis: string;
  image_data_url?: string;
  created_at: string;
};

function mapLog(row: ChartWatchRow): ChartWatchLog {
  return {
    id: row.id,
    status: row.status,
    summary: row.summary,
    analysis: row.analysis,
    imageDataUrl: row.image_data_url,
    createdAt: row.created_at
  };
}

export async function GET() {
  const rows = getDb()
    .prepare("SELECT * FROM chart_watch_logs ORDER BY created_at DESC LIMIT 30")
    .all() as ChartWatchRow[];
  return NextResponse.json({ logs: rows.map(mapLog) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { notes?: string; imageDataUrl?: string };
  if (!body.imageDataUrl && !body.notes?.trim()) {
    return NextResponse.json(
      { error: "Chart screenshot or notes are required." },
      { status: 400 }
    );
  }

  const memories = getRelevantMemories(
    [body.notes || "", "APEX MNQ 15 second chart setup stop risk trigger"].join(" "),
    8
  );
  const result = await analyzeChartWatch({
    notes: body.notes || "",
    imageDataUrl: body.imageDataUrl,
    memories
  });

  const db = getDb();
  db.prepare(
    "INSERT INTO chart_watch_logs (id, status, summary, analysis, image_data_url) VALUES (?, ?, ?, ?, ?)"
  ).run(
    id("watch"),
    result.status,
    result.summary,
    result.analysis,
    body.imageDataUrl || null
  );

  const rows = db
    .prepare("SELECT * FROM chart_watch_logs ORDER BY created_at DESC LIMIT 30")
    .all() as ChartWatchRow[];

  return NextResponse.json({ result, logs: rows.map(mapLog), memories });
}
