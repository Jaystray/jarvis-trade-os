# JARVIS Trading Assistant MVP

A personal AI assistant dashboard for trading workflows. It includes chat, browser voice commands, text-to-speech playback, SQLite-backed memories, trading notes, a daily trade journal, and a Codex prompt builder.

## Features

- Next.js App Router with TypeScript and Tailwind CSS
- Server-side OpenAI integration with `OPENAI_API_KEY`
- Local SQLite database with schema in `db/schema.sql`
- Memory retrieval before assistant responses
- Manual memory capture and chat-triggered `Remember...` capture
- Voice command input through the browser Speech Recognition API
- Response playback through browser speech synthesis
- APEX strategy notes, trade review notes, lessons learned
- Daily trade journal with screenshot upload stored locally in SQLite
- Codex prompt builder with copy-to-clipboard
- Online Intel Agent for weather, traffic, news, market headlines, and web lookup
- Local Mac launcher for allowlisted apps and trading chart URLs

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create environment variables:

   ```bash
   cp .env.example .env
   ```

3. Add your OpenAI key to `.env`:

   ```bash
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4.1-mini
   DATABASE_URL=file:./db/jarvis.sqlite
   JARVIS_DEFAULT_LOCATION=Your City, ST
   ```

4. Seed example APEX data:

   ```bash
   npm run db:seed
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000).

## Railway Deployment

Jarvis is Railway-ready with `railway.json` and a health check at `/api/health`.

Recommended first deployment:

1. Create a new Railway project from this GitHub repo.
2. Add a persistent Railway volume mounted at `/app/db` if you want to keep SQLite for v1.
3. Set `DATABASE_URL=file:/app/db/jarvis.sqlite`.
4. Add environment variables:

   ```bash
   OPENAI_API_KEY=
   OPENAI_MODEL=gpt-4.1-mini
   DATABASE_URL=file:/app/db/jarvis.sqlite
   TRADINGVIEW_WEBHOOK_SECRET=
   JARVIS_DEFAULT_LOCATION=
   GOOGLE_MAPS_API_KEY=
   BRAVE_SEARCH_API_KEY=
   ```

5. Deploy. Railway should run `npm run build` and `npm start`.

For a later multi-user or high-volume version, migrate the database from SQLite volume storage to Railway Postgres.

## TradingView Webhook

TradingView alerts can post to:

```text
https://YOUR-RAILWAY-DOMAIN/api/webhooks/tradingview?secret=YOUR_SECRET
```

Suggested TradingView alert message:

```json
{
  "symbol": "{{ticker}}",
  "timeframe": "{{interval}}",
  "action": "entry",
  "price": "{{close}}",
  "message": "{{strategy.order.alert_message}}"
}
```

Jarvis stores each alert in `tradingview_alerts` and shows the latest alert in the cockpit. If you can send a hosted chart image URL, include:

```json
{
  "screenshotUrl": "https://example.com/chart.png"
}
```

TradingView webhooks usually send alert data, not screenshots. For automated screenshots throughout the day, the next build should add a local or hosted Chart Capture Agent that can open a chart source, capture an image, and submit it to `/api/chart-watch`.

## Database

The schema is defined in `db/schema.sql` and is initialized automatically when the app or seed script first touches the database.

Tables:

- `sessions`
- `messages`
- `memories`
- `trade_journal`
- `workspace_notes`

The default local database path is `db/jarvis.sqlite`.

## Security Notes

- The OpenAI key is only read inside server-side route handlers and `lib/openai.ts`.
- Online provider keys are only read inside server-side route handlers and `lib/online-intel.ts`.
- Never expose `OPENAI_API_KEY` to client components.
- `.env` and SQLite database files are ignored by git.

## Online Intel

Jarvis can answer live-data requests through chat or voice.

- Weather and temperature: works through Open-Meteo with no API key. Set `JARVIS_DEFAULT_LOCATION` or ask for a city, for example `weather in Dallas`.
- Traffic: requires `GOOGLE_MAPS_API_KEY`. Set `JARVIS_TRAFFIC_ORIGIN` and `JARVIS_TRAFFIC_DESTINATION`, or ask `traffic from Fresno CA to San Jose CA`.
- News, market headlines, and web lookup: require `BRAVE_SEARCH_API_KEY`.

Optional `.env` values:

```bash
JARVIS_DEFAULT_LOCATION=
GOOGLE_MAPS_API_KEY=
JARVIS_TRAFFIC_ORIGIN=
JARVIS_TRAFFIC_DESTINATION=
BRAVE_SEARCH_API_KEY=
```

## Local App Launcher

Jarvis can open allowlisted apps and URLs when the Next.js server is running on your Mac.

Supported voice/chat examples:

- `Jarvis, open TradingView`
- `Jarvis, open MNQ`
- `Jarvis, launch NQ chart`

Optional `.env` values:

```bash
JARVIS_ENABLE_LOCAL_LAUNCH=true
JARVIS_TRADINGVIEW_APP=
JARVIS_TRADINGVIEW_URL=https://www.tradingview.com/chart/
JARVIS_MNQ_URL=https://www.tradingview.com/chart/?symbol=CME_MINI%3AMNQ1%21
JARVIS_NQ_URL=https://www.tradingview.com/chart/?symbol=CME_MINI%3ANQ1%21
```

Set `JARVIS_TRADINGVIEW_APP=TradingView` if you install the TradingView desktop app and want Jarvis to open the app instead of a browser URL. Hosted deployments such as Railway cannot open apps on your Mac; that would require a separate local desktop agent.

## Demo Mode

If `OPENAI_API_KEY` is empty, the app still runs in local demo mode. Chat and prompt builder responses are deterministic placeholders, while memories, notes, and journals still save normally.
