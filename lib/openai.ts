import OpenAI from "openai";
import type { ChartWatchLog, Memory, WorkspaceNote } from "@/types";
import type { OnlineIntelResult } from "@/lib/online-intel";
import { formatOnlineIntelForPrompt } from "@/lib/online-intel";

type ChartWatchStatus =
  | "NO_TRADE"
  | "SETUP_FORMING"
  | "WAIT_FOR_TRIGGER"
  | "INVALID_SETUP"
  | "RISK_CHECK_REQUIRED";

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function memoryContext(memories: Memory[]) {
  if (!memories.length) return "No relevant saved memories found.";
  return memories.map((memory) => `- ${memory.title}: ${memory.content}`).join("\n");
}

export async function generateAssistantReply(
  input: string,
  memories: Memory[],
  onlineIntel?: OnlineIntelResult | null
) {
  if (!hasOpenAIKey()) {
    if (onlineIntel) {
      return [
        onlineIntel.summary,
        onlineIntel.details?.length ? onlineIntel.details.join("\n") : "",
        onlineIntel.missingConfig?.length
          ? `Missing setup: ${onlineIntel.missingConfig.join(", ")}`
          : ""
      ]
        .filter(Boolean)
        .join("\n\n");
    }
    return [
      "API key is not configured yet, so I am running in local demo mode.",
      "Here is how I would frame the next action:",
      input.includes("Remember")
        ? "I saved that as a memory and will use it as context in future replies."
        : `I found ${memories.length} relevant memory note(s). For trading work, I would turn this into a specific checklist, execution rule, or review prompt.`
    ].join("\n\n");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You are JARVIS, a concise personal AI assistant for a trader. Be direct, practical, and context-aware. Use saved memories when relevant, but do not mention memory retrieval mechanics unless helpful."
      },
      {
        role: "system",
        content: `Relevant saved memories:\n${memoryContext(memories)}`
      },
      {
        role: "system",
        content: [
          "Live online intel, if requested:",
          formatOnlineIntelForPrompt(onlineIntel || null),
          "",
          "If live intel is present, answer from it clearly and mention missing provider setup if needed.",
          "Do not pretend to have checked live data when no live intel was provided."
        ].join("\n")
      },
      { role: "user", content: input }
    ]
  });

  return completion.choices[0]?.message.content?.trim() || "I could not generate a response.";
}

export async function generateCodexPrompt(changeRequest: string, memories: Memory[]) {
  if (!hasOpenAIKey()) {
    return `Build or modify the app with the following change:\n\n${changeRequest}\n\nContext to preserve:\n${memoryContext(memories)}\n\nRequirements:\n- Keep the implementation clean and modular.\n- Match the existing project style.\n- Add or update tests where behavior changes.\n- Verify the final app before reporting completion.`;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.25,
    messages: [
      {
        role: "system",
        content:
          "Format the user's rough request into a clean, implementation-ready Codex prompt. Include goal, context, constraints, deliverables, and verification steps. Do not add fluff."
      },
      {
        role: "user",
        content: `Saved context:\n${memoryContext(memories)}\n\nRequested change:\n${changeRequest}`
      }
    ]
  });

  return completion.choices[0]?.message.content?.trim() || changeRequest;
}

export async function analyzeTradeReview(input: {
  notes: string;
  imageDataUrl?: string;
  memories: Memory[];
}) {
  const context = memoryContext(input.memories);
  const notes = input.notes.trim() || "No written notes provided.";

  if (!hasOpenAIKey()) {
    return [
      "Trade Review",
      "",
      "API key is not configured, so this is a local demo review.",
      "",
      "Setup Read:",
      "- Review whether the trade matched the saved APEX context.",
      "",
      "Rule Check:",
      "- Confirm MNQ, 15 second chart, clean setup, planned stop, and no revenge-trade behavior.",
      "",
      "Next Session Focus:",
      "- Write the exact entry trigger before taking the next trade."
    ].join("\n");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text: [
        "You are JARVIS reviewing a futures trading screenshot and notes.",
        "Do not provide financial advice or predict future market movement.",
        "Analyze only execution quality, visible chart context, risk management, and process discipline.",
        "",
        `Saved trader context:\n${context}`,
        "",
        `Trader notes:\n${notes}`,
        "",
        "Return this exact structure:",
        "1. Chart Read",
        "2. Setup Quality",
        "3. Risk And Stop Review",
        "4. Mistake Tags",
        "5. Lesson Learned",
        "6. Next Trade Checklist"
      ].join("\n")
    }
  ];

  if (input.imageDataUrl) {
    content.push({ type: "image_url", image_url: { url: input.imageDataUrl } });
  }

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.25,
    messages: [
      {
        role: "system",
        content:
          "You are a concise trade review assistant. Be direct, practical, and focused on execution process. Avoid market predictions."
      },
      {
        role: "user",
        content
      }
    ] as any
  });

  return completion.choices[0]?.message.content?.trim() || "I could not generate a trade review.";
}

const agentInstructions: Record<string, { name: string; system: string; output: string }> = {
  architect: {
    name: "System Architect",
    system:
      "You design the Jarvis trading operating system. Convert messy ideas into clean modules, data flows, screens, and implementation phases.",
    output:
      "Return: Objective, Required Modules, Data Needed, Build Steps, Risks, Next Codex Prompt."
  },
  logic: {
    name: "Logic Manager",
    system:
      "You turn discretionary trading ideas into explicit rules, checklists, states, validations, and edge cases. You are precise and practical.",
    output:
      "Return: Rule Set, Inputs, Decision States, Invalid Conditions, Logging Requirements, Test Scenarios."
  },
  risk: {
    name: "Risk Guardian",
    system:
      "You protect the trader from process errors. Focus on risk rules, lockouts, revenge trading, max loss behavior, stop discipline, and pre-trade permission checks.",
    output:
      "Return: Risk Read, Rule Break Risks, Lockout Triggers, Required Confirmations, Safer Next Action."
  },
  chart: {
    name: "Chart Watcher",
    system:
      "You evaluate chart-watching logic for an APEX MNQ 15-second workflow. Do not predict markets. Define what the system should watch, classify, and say out loud.",
    output:
      "Return: Watch Conditions, No-Trade Conditions, Setup-Forming Conditions, Alert Language, Data/Screenshot Needs."
  },
  codex: {
    name: "Codex Builder",
    system:
      "You create implementation-ready prompts for Codex to build features in this Next.js Jarvis trading OS.",
    output:
      "Return a clean Codex prompt with Goal, Context, Requirements, Files/Areas, UX Behavior, Verification."
  }
};

export function getAgentName(agentId: string) {
  return agentInstructions[agentId]?.name || "Jarvis Agent";
}

export async function runSystemAgent(input: {
  agentId: string;
  request: string;
  memories: Memory[];
  recentRuns?: string;
}) {
  const agent = agentInstructions[input.agentId] || agentInstructions.architect;
  const context = memoryContext(input.memories);
  const request = input.request.trim();

  if (!hasOpenAIKey()) {
    return [
      `${agent.name} Output`,
      "",
      `Request: ${request}`,
      "",
      agent.output,
      "",
      "Next step: configure the OpenAI API key to generate a full agent plan."
    ].join("\n");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.28,
    messages: [
      {
        role: "system",
        content: [
          agent.system,
          "You are operating inside a personal Jarvis trading OS.",
          "Be concise, structured, and implementation-oriented.",
          "Do not provide financial advice or trade predictions.",
          agent.output
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `Saved memories:\n${context}`,
          "",
          `Recent agent work:\n${input.recentRuns || "No recent agent runs."}`,
          "",
          `Current request:\n${request}`
        ].join("\n")
      }
    ]
  });

  return completion.choices[0]?.message.content?.trim() || "The agent could not produce an output.";
}

function parseChartWatchJson(text: string) {
  const fallback = {
    status: "RISK_CHECK_REQUIRED" as ChartWatchStatus,
    summary: "Chart scan completed. Review the written analysis before acting.",
    analysis: text,
    checklist: ["Confirm setup quality.", "Define stop before entry.", "Avoid revenge trades."]
  };

  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
    const parsed = JSON.parse(cleaned);
    return {
      status: parsed.status || fallback.status,
      summary: parsed.summary || fallback.summary,
      analysis: parsed.analysis || text,
      checklist: Array.isArray(parsed.checklist) ? parsed.checklist : fallback.checklist
    };
  } catch {
    return fallback;
  }
}

export async function analyzeChartWatch(input: {
  notes: string;
  imageDataUrl?: string;
  memories: Memory[];
}) {
  const context = memoryContext(input.memories);
  const notes = input.notes.trim() || "No chart notes provided.";

  if (!hasOpenAIKey()) {
    return {
      status: "RISK_CHECK_REQUIRED" as ChartWatchStatus,
      summary: "Demo scan complete. Confirm the setup manually before entry.",
      analysis:
        "Chart Watcher is in local demo mode. Check MNQ, 15 second APEX rules, stop placement, setup cleanliness, and revenge-trade risk.",
      checklist: ["Confirm MNQ 15 second chart.", "Wait for trigger.", "Define stop and invalidation."]
    };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text: [
        "You are Chart Watcher inside a personal Jarvis trading OS.",
        "Analyze the uploaded chart screenshot for process quality only.",
        "Do not provide financial advice, trade signals, or market predictions.",
        "Classify the chart into exactly one status:",
        "NO_TRADE, SETUP_FORMING, WAIT_FOR_TRIGGER, INVALID_SETUP, RISK_CHECK_REQUIRED.",
        "",
        `Saved APEX context:\n${context}`,
        "",
        `User chart notes:\n${notes}`,
        "",
        "Return only valid JSON with this shape:",
        "{",
        "  \"status\": \"NO_TRADE | SETUP_FORMING | WAIT_FOR_TRIGGER | INVALID_SETUP | RISK_CHECK_REQUIRED\",",
        "  \"summary\": \"one short sentence Jarvis can speak\",",
        "  \"analysis\": \"structured explanation of visible context and process checks\",",
        "  \"checklist\": [\"next process check\", \"next process check\"]",
        "}"
      ].join("\n")
    }
  ];

  if (input.imageDataUrl) {
    content.push({ type: "image_url", image_url: { url: input.imageDataUrl } });
  }

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.15,
    messages: [
      {
        role: "system",
        content:
          "You classify chart screenshots for trading-process review. Never tell the user to buy, sell, long, or short. Focus on setup state, invalidation, risk, and patience."
      },
      {
        role: "user",
        content
      }
    ] as any
  });

  return parseChartWatchJson(completion.choices[0]?.message.content?.trim() || "");
}

function chartWatchContext(logs: ChartWatchLog[]) {
  if (!logs.length) return "No chart watcher logs yet.";
  return logs
    .map((log) => `- ${log.status}: ${log.summary}\n  ${log.analysis.slice(0, 700)}`)
    .join("\n");
}

function noteContext(notes: WorkspaceNote[]) {
  if (!notes.length) return "No recent trade review notes yet.";
  return notes
    .map((note) => `- ${note.title}: ${note.content.slice(0, 900)}`)
    .join("\n");
}

export async function generatePineRebuild(input: {
  title: string;
  currentScript: string;
  issueNotes: string;
  memories: Memory[];
  chartLogs: ChartWatchLog[];
  tradeReviews: WorkspaceNote[];
}) {
  const context = memoryContext(input.memories);
  const chartContext = chartWatchContext(input.chartLogs);
  const reviews = noteContext(input.tradeReviews);
  const script = input.currentScript.trim() || "No current Pine Script was provided.";
  const issues = input.issueNotes.trim() || "Rebuild the APEX logic from the recent chart watch and review context.";

  if (!hasOpenAIKey()) {
    return [
      "Pine Rebuild Lab",
      "",
      "API key is not configured, so this is a local demo output.",
      "",
      "1. Flaws Found",
      "- Convert repeated trade-review mistakes into explicit no-trade filters.",
      "- Separate setup-forming, trigger, invalidation, and risk-check states.",
      "",
      "2. Rebuild Plan",
      "- Add inputs for session control, risk confirmation, setup tag, and invalidation.",
      "- Add alertcondition calls for setup forming, wait for trigger, invalid setup, and risk check.",
      "",
      "3. Updated Pine Script v6",
      "```pine",
      "//@version=6",
      "indicator(\"APEX Process Guard v1\", overlay=true)",
      "setupForming = false",
      "waitForTrigger = false",
      "invalidSetup = false",
      "riskCheck = true",
      "plotshape(setupForming, title=\"Setup Forming\", style=shape.circle)",
      "alertcondition(waitForTrigger, \"APEX Wait For Trigger\", \"APEX setup needs trigger confirmation\")",
      "```",
      "",
      "4. Alert Conditions",
      "- Alert only on process states, not guaranteed trade direction.",
      "",
      "5. Test Checklist",
      "- Replay clean setups, invalid setups, and risk-check examples.",
      "",
      "6. What To Watch Next",
      "- Capture screenshots where the script fails to match the APEX read."
    ].join("\n");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "You are Pine Rebuild Lab inside a personal Jarvis trading OS.",
          "You are an expert Pine Script v6 refactoring assistant.",
          "Do not give financial advice or tell the user to buy, sell, long, or short.",
          "Focus on translating process flaws, chart-watch states, and review notes into cleaner Pine logic.",
          "Return a practical rebuild the user can paste into TradingView and then test manually.",
          "Use Pine Script v6 syntax when writing code."
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `Rebuild title: ${input.title || "APEX Pine rebuild"}`,
          "",
          `Saved APEX memories:\n${context}`,
          "",
          `Recent Chart Watcher logs:\n${chartContext}`,
          "",
          `Recent trade review notes:\n${reviews}`,
          "",
          `Current Pine Script:\n${script}`,
          "",
          `Issues / requested changes:\n${issues}`,
          "",
          "Return this exact structure:",
          "1. Flaws Found",
          "2. Rebuild Plan",
          "3. Updated Pine Script v6",
          "4. Alert Conditions",
          "5. Test Checklist",
          "6. What To Watch Next"
        ].join("\n")
      }
    ]
  });

  return completion.choices[0]?.message.content?.trim() || "Pine Rebuild Lab could not produce output.";
}
