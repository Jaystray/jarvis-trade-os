import { NextResponse } from "next/server";
import { getDb, id } from "@/lib/db";
import { getAgentName, runSystemAgent } from "@/lib/openai";
import { getRelevantMemories } from "@/lib/retrieval";
import type { AgentRun } from "@/types";

type AgentRunRow = {
  id: string;
  agent_id: string;
  agent_name: string;
  input: string;
  output: string;
  created_at: string;
};

function mapRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    input: row.input,
    output: row.output,
    createdAt: row.created_at
  };
}

export async function GET() {
  const rows = getDb()
    .prepare("SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT 30")
    .all() as AgentRunRow[];
  return NextResponse.json({ runs: rows.map(mapRun) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { agentId?: string; request?: string };
  const agentId = body.agentId || "architect";
  const input = body.request?.trim();
  if (!input) {
    return NextResponse.json({ error: "Agent request is required." }, { status: 400 });
  }

  const db = getDb();
  const recentRows = db
    .prepare("SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT 5")
    .all() as AgentRunRow[];
  const recentRuns = recentRows
    .map((run) => `${run.agent_name}: ${run.output.slice(0, 700)}`)
    .join("\n\n");
  const memories = getRelevantMemories(input, 8);
  const agentName = getAgentName(agentId);
  const output = await runSystemAgent({
    agentId,
    request: input,
    memories,
    recentRuns
  });

  db.prepare(
    "INSERT INTO agent_runs (id, agent_id, agent_name, input, output) VALUES (?, ?, ?, ?, ?)"
  ).run(id("agent"), agentId, agentName, input, output);

  const rows = db
    .prepare("SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT 30")
    .all() as AgentRunRow[];

  return NextResponse.json({ output, runs: rows.map(mapRun), memories });
}
