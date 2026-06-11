CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trade_journal (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  market TEXT NOT NULL,
  direction TEXT NOT NULL,
  entry TEXT NOT NULL,
  stop TEXT NOT NULL,
  target TEXT NOT NULL,
  result TEXT NOT NULL,
  points TEXT NOT NULL,
  screenshot_data_url TEXT,
  notes TEXT NOT NULL,
  mistake_tag TEXT NOT NULL,
  setup_tag TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspace_notes (
  id TEXT PRIMARY KEY,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chart_watch_logs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  analysis TEXT NOT NULL,
  image_data_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pine_rebuilds (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  input_script TEXT NOT NULL,
  issue_notes TEXT NOT NULL,
  output TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tradingview_alerts (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  action TEXT NOT NULL,
  price TEXT NOT NULL,
  message TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  screenshot_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_memories_content ON memories(content);
CREATE INDEX IF NOT EXISTS idx_trade_journal_date ON trade_journal(date DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_notes_section ON workspace_notes(section, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chart_watch_logs_created ON chart_watch_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pine_rebuilds_created ON pine_rebuilds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tradingview_alerts_created ON tradingview_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tradingview_alerts_symbol ON tradingview_alerts(symbol, created_at DESC);
