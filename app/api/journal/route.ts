import { NextResponse } from "next/server";
import { getDb, id } from "@/lib/db";
import type { TradeJournalEntry } from "@/types";

type TradeRow = {
  id: string;
  date: string;
  market: string;
  direction: TradeJournalEntry["direction"];
  entry: string;
  stop: string;
  target: string;
  result: string;
  points: string;
  screenshot_data_url?: string;
  notes: string;
  mistake_tag: string;
  setup_tag: string;
  created_at: string;
};

function mapTrade(row: TradeRow): TradeJournalEntry {
  return {
    id: row.id,
    date: row.date,
    market: row.market,
    direction: row.direction,
    entry: row.entry,
    stop: row.stop,
    target: row.target,
    result: row.result,
    points: row.points,
    screenshotDataUrl: row.screenshot_data_url,
    notes: row.notes,
    mistakeTag: row.mistake_tag,
    setupTag: row.setup_tag,
    createdAt: row.created_at
  };
}

export async function GET() {
  const rows = getDb()
    .prepare("SELECT * FROM trade_journal ORDER BY date DESC, created_at DESC LIMIT 40")
    .all() as TradeRow[];
  return NextResponse.json({ entries: rows.map(mapTrade) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<TradeJournalEntry>;
  const db = getDb();
  db.prepare(
    `INSERT INTO trade_journal
      (id, date, market, direction, entry, stop, target, result, points, screenshot_data_url, notes, mistake_tag, setup_tag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id("trade"),
    body.date || new Date().toISOString().slice(0, 10),
    body.market || "MNQ",
    body.direction || "",
    body.entry || "",
    body.stop || "",
    body.target || "",
    body.result || "",
    body.points || "",
    body.screenshotDataUrl || null,
    body.notes || "",
    body.mistakeTag || "",
    body.setupTag || ""
  );

  const rows = db
    .prepare("SELECT * FROM trade_journal ORDER BY date DESC, created_at DESC LIMIT 40")
    .all() as TradeRow[];
  return NextResponse.json({ entries: rows.map(mapTrade) });
}
