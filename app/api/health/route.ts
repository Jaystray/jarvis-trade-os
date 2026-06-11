import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  getDb().prepare("SELECT 1").get();

  return NextResponse.json({
    ok: true,
    service: "jarvis-trade-os",
    time: new Date().toISOString()
  });
}
