export type ChatMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

export type Memory = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
};

export type TradeJournalEntry = {
  id: string;
  date: string;
  market: string;
  direction: "Long" | "Short" | "Both" | "";
  entry: string;
  stop: string;
  target: string;
  result: string;
  points: string;
  screenshotDataUrl?: string;
  notes: string;
  mistakeTag: string;
  setupTag: string;
  createdAt: string;
};

export type WorkspaceNote = {
  id: string;
  section: string;
  title: string;
  content: string;
  createdAt: string;
};

export type AgentRun = {
  id: string;
  agentId: string;
  agentName: string;
  input: string;
  output: string;
  createdAt: string;
};

export type ChartWatchLog = {
  id: string;
  status: "NO_TRADE" | "SETUP_FORMING" | "WAIT_FOR_TRIGGER" | "INVALID_SETUP" | "RISK_CHECK_REQUIRED";
  summary: string;
  analysis: string;
  imageDataUrl?: string;
  createdAt: string;
};

export type PineRebuild = {
  id: string;
  title: string;
  inputScript: string;
  issueNotes: string;
  output: string;
  createdAt: string;
};

export type LocalLaunchResult = {
  enabled: boolean;
  launched: boolean;
  message: string;
  target?: {
    id: string;
    label: string;
    type: "app" | "url";
  };
};

export type TradingViewAlert = {
  id: string;
  symbol: string;
  timeframe: string;
  action: string;
  price: string;
  message: string;
  rawPayload: Record<string, unknown>;
  screenshotUrl?: string;
  createdAt: string;
};

export type TradingViewPnlState = {
  id: string;
  symbol: string;
  todayPoints: string;
  todayPnl: string;
  weekPoints: string;
  weekPnl: string;
  trades: string;
  winRate: string;
  mfe: string;
  mae: string;
  sourceAlertId?: string;
  updatedAt: string;
};

export type EconomicCalendarEvent = {
  date: string;
  dateKey?: string;
  time: string;
  eventName: string;
  impactLevel: "high";
  actual: string;
  forecast: string;
  previous: string;
};
