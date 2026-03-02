# MyBot

> **A multi-channel AI assistant with a web chat interface, RAG, long-term memory, calendar integration, and optional Slack & MCP (GitHub/Notion) support.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [LLM Providers](#llm-providers)
- [Available Tools](#available-tools)
- [Project Structure](#project-structure)
- [Optional Integrations](#optional-integrations)
- [Troubleshooting](#troubleshooting)

---

## Overview

MyBot is a full-stack AI assistant that runs locally. It combines:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Web Frontend** | React + Vite + TailwindCSS | Dark-mode chat UI with settings |
| **Backend** | Node.js + TypeScript + Express | REST API + WebSocket server |
| **AI Providers** | Anthropic, OpenAI, Gemini, Kimi, Together.ai | Pluggable LLM backends |
| **RAG** | ChromaDB + OpenAI embeddings | Semantic search over indexed content |
| **Memory** | mem0.ai cloud | Long-term user memory across sessions |
| **Calendar** | Google Calendar API + Cal.com | Event management and scheduling via AI |
| **MCP** | GitHub + Notion MCP servers | External tool integration (optional) |
| **Slack** | Slack Bolt.js (Socket Mode) | Slack channel/DM integration (optional) |

Slack is **optional** — the web interface works standalone with any supported LLM provider.

---

## Features

### Web Chat Interface
- Real-time messaging via WebSocket
- Dark mode UI (black & red theme)
- Multi-provider LLM switching from Settings
- Secure, encrypted API key storage per provider
- Chat history with memory and RAG badges on responses

### Multi-Provider LLM Support
Add your own API key in Settings and switch between:
- **Anthropic** Claude (claude-sonnet-4, claude-opus-4, etc.)
- **OpenAI** GPT (gpt-4o, gpt-4o-mini, etc.)
- **Google Gemini** (gemini-2.0-flash, gemini-1.5-pro, etc.)
- **Kimi** / Moonshot (moonshot-v1-8k, etc.)
- **Together.ai** (Llama, Mixtral, Qwen, etc.)

### RAG (Retrieval Augmented Generation)
- Semantic search across indexed content (Slack messages when configured)
- Background indexing every hour
- ChromaDB local vector store
- Smart relevance scoring before retrieval

### Long-Term Memory
- Automatic fact extraction from conversations via mem0.ai
- Personalized responses based on user history
- Cross-session persistence
- User-controlled: view, add, or delete memories

### Calendar Integration
- **Google Calendar** — list calendars, get events, book/update/cancel appointments, check free/busy
- Two auth modes: **OAuth 2.0** (user login via Google consent screen) or **Service Account** (JWT)
- **Cal.com** — list event types, check availability, create/cancel/reschedule bookings
- Natural language calendar management

### MCP (Model Context Protocol) — Optional
- **GitHub**: 26 tools — search repos, create issues, read files, list PRs
- **Notion**: 21 tools — search pages, query databases, create/update content

### Slack Integration — Optional
- DM conversations with pairing/approval system
- Channel @mentions
- Thread summarization with `/summarize`
- Message scheduling and reminders
- Typing indicators and reactions

---

## Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     CHANNELS                                  │
│                                                              │
│   ┌─────────────────────────┐   ┌──────────────────────┐    │
│   │    WEB INTERFACE        │   │   SLACK (optional)   │    │
│   │                         │   │                      │    │
│   │  React + Vite frontend  │   │  Bolt.js Socket Mode │    │
│   │  WebSocket + REST API   │   │  DMs + @mentions     │    │
│   └──────────┬──────────────┘   └──────────┬───────────┘    │
└──────────────┼──────────────────────────────┼────────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    AI AGENT (agent.ts)                        │
│                                                              │
│   1. Retrieve memories (mem0)                                │
│   2. RAG pre-check → semantic search                         │
│   3. Build context (memory + RAG + session history)          │
│   4. Call LLM with tools                                     │
│   5. Execute tool calls (loop until done)                    │
│   6. Store new memories (background)                         │
│   7. Return response                                         │
└─────────────────────────────┬────────────────────────────────┘
                              │
        ┌─────────────────────┼──────────────────────┐
        ▼                     ▼                      ▼
┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  LLM LAYER   │   │   TOOL LAYER     │   │  STORAGE LAYER   │
│              │   │                  │   │                  │
│ • Anthropic  │   │ • Slack actions  │   │ • SQLite (sess.) │
│ • OpenAI     │   │ • Calendar tools │   │ • ChromaDB (RAG) │
│ • Gemini     │   │ • MCP: GitHub    │   │ • mem0 Cloud     │
│ • Kimi       │   │ • MCP: Notion    │   │   (memory)       │
│ • Together   │   │ • Memory tools   │   │                  │
└──────────────┘   └──────────────────┘   └──────────────────┘
```

### Web Channel Architecture

```
Browser
  │
  ├── HTTP REST → Express server (port 3001)
  │   ├── GET  /api/health                    → health check
  │   ├── GET  /api/settings                  → list API keys
  │   ├── POST /api/settings/keys             → add API key
  │   ├── PUT  /api/settings/active           → set active key
  │   ├── GET  /api/settings/models           → list models
  │   ├── POST /api/upload                    → upload document to RAG index
  │   ├── GET  /api/auth/google               → get Google OAuth consent URL
  │   └── GET  /api/auth/google/callback      → OAuth token exchange & save
  │
  └── WebSocket (ws://) → processMessage()
      ├── Incoming: { type: "chat", content, sessionId }
      └── Outgoing: { type: "message"|"status"|"error", content, metadata }
```

### Message Processing Flow

```
User sends message
        │
        ▼
┌──────────────────┐
│ 1. Memory recall │  mem0.search(message, userId)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 2. RAG pre-check │  shouldUseRAG? → vectorstore.search()
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ 3. Build context                     │
│   system prompt                      │
│ + memory context                     │
│ + RAG context                        │
│ + session history (last 10 messages) │
│ + current message                    │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────┐
│ 4. LLM call      │  provider determined by active API key
│    + tools       │
└────────┬─────────┘
         │
    (tool calls?)
         │
         ├─ yes → execute tool → add result → LLM again (loop)
         │
         └─ no  → final response
                       │
                       ├── 5. Send response to user
                       └── 6. Store memories (background)
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Step 1: Install dependencies

```bash
# Backend
cd MyBot
npm install

# Frontend
cd web-frontend
npm install
```

### Step 2: Create `.env`

```bash
cp .env.example .env
```

For local web-only usage, leave all tokens empty. API keys are added via the Settings UI.

### Step 3: Start the backend

```bash
# In the MyBot directory
npm run dev
```

Wait for:
```
✅ Web server started
✅ Web Interface: ✅ (http://localhost:3001)
```

### Step 4: Start the frontend

Open a **second terminal**:

```bash
# In the MyBot/web-frontend directory
npm run dev
```

Wait for:
```
➜  Local:   http://localhost:3000
```

### Step 5: Add your API key

1. Open **http://localhost:3000**
2. Click **Settings** → **Add API Key**
3. Select provider, enter your key, click **Add Key**
4. Click **Set Active**
5. Go to **Chat** and start chatting

---

## Configuration

All settings live in `.env`. Copy `.env.example` to get started.

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_ENABLED` | `true` | Enable web server |
| `WEB_PORT` | `3001` | Backend port |
| `WEB_CORS_ORIGINS` | `http://localhost:3000,...` | Allowed frontend origins |
| `WEB_ENCRYPTION_KEY` | (change this) | Key for encrypting stored API keys |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `DATABASE_PATH` | `./data/assistant.db` | SQLite database path |
| `MAX_HISTORY_MESSAGES` | `50` | Messages kept in session |

### AI Provider Fallback (Optional)

These are used only if no API key is set via the Settings UI:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Default Anthropic key |
| `OPENAI_API_KEY` | Default OpenAI key |
| `DEFAULT_MODEL` | Default model (e.g. `gpt-4o`) |

### RAG

| Variable | Default | Description |
|----------|---------|-------------|
| `RAG_ENABLED` | `true` | Enable RAG system |
| `RAG_EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `RAG_VECTOR_DB_PATH` | `./data/chroma` | Local vector store path |
| `RAG_MAX_RESULTS` | `10` | Max documents to retrieve |
| `RAG_MIN_SIMILARITY` | `0.5` | Minimum relevance score (0–1) |
| `RAG_INDEX_INTERVAL_HOURS` | `1` | Re-index frequency |

### Memory (mem0)

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORY_ENABLED` | `true` | Enable memory system |
| `MEM0_API_KEY` | — | mem0.ai cloud API key |
| `MEMORY_EXTRACTION_MODEL` | `gpt-4o-mini` | Model for fact extraction |

### Google Calendar OAuth (Optional)

Required only if connecting Google Calendar via the OAuth flow in Settings:

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL (default: `http://localhost:3001/api/auth/google/callback`) |

Leave empty to use Service Account auth instead (upload JSON key in Settings).

### Slack (Optional)

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Bot OAuth token (`xoxb-`) |
| `SLACK_APP_TOKEN` | App-level token (`xapp-`) |
| `SLACK_USER_TOKEN` | User token for reminders (`xoxp-`) |
| `SLACK_SIGNING_SECRET` | Request signing secret |

Leave all empty to disable Slack and use the web interface only.

### MCP (Optional)

| Variable | Description |
|----------|-------------|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub PAT for MCP server |
| `NOTION_API_TOKEN` | Notion integration token for MCP server |

Leave empty to disable MCP. The app starts cleanly without them.

---

## LLM Providers

API keys are managed through the Settings page in the web UI — no `.env` changes needed.

### Anthropic Claude
1. Go to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Create a key (starts with `sk-ant-`)
3. In Settings, select **Anthropic** and paste the key

### OpenAI GPT
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a key (starts with `sk-`)
3. In Settings, select **OpenAI** and paste the key

### Google Gemini
1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Create a key
3. In Settings, select **Gemini** and paste the key

### Kimi (Moonshot)
1. Go to [platform.moonshot.cn/console/api-keys](https://platform.moonshot.cn/console/api-keys)
2. Create a key
3. In Settings, select **Kimi** and paste the key

### Together.ai
1. Go to [api.together.xyz/settings/api-keys](https://api.together.xyz/settings/api-keys)
2. Create a key
3. In Settings, select **Together** and paste the key

---

## Available Tools

### Built-in Tools

| Tool | Description |
|------|-------------|
| `search_knowledge_base` | Semantic search across indexed content (RAG) |
| `send_message` | Send a Slack message (Slack only) |
| `get_channel_history` | Get recent Slack messages |
| `schedule_message` | Schedule a one-time message |
| `schedule_recurring_message` | Schedule a recurring message |
| `set_reminder` | Set a reminder |
| `list_channels` | List Slack channels |
| `list_users` | List Slack users |
| `get_my_memories` | Show stored memories |
| `remember_this` | Explicitly store a fact |
| `forget_about` | Delete specific memories |
| `forget_everything` | Delete all memories for user |

### Google Calendar Tools

| Tool | Description |
|------|-------------|
| `list_calendars` | List all calendars the assistant has access to |
| `get_calendar_events` | Get events within a date range |
| `check_availability` | Check free/busy slots for one or more calendars |
| `book_appointment` | Create a new event (supports attendees, timezone, location) |
| `update_appointment` | Reschedule or edit an existing event |
| `cancel_appointment` | Delete an event and optionally notify attendees |

### Cal.com Tools

| Tool | Description |
|------|-------------|
| `calcom_list_event_types` | List all Cal.com booking pages with IDs and durations |
| `calcom_list_bookings` | List bookings filtered by status (upcoming/past/cancelled) |
| `calcom_check_availability` | Get available time slots for a given event type |
| `calcom_create_booking` | Book a time slot for an attendee |
| `calcom_cancel_booking` | Cancel an existing booking |
| `calcom_reschedule_booking` | Move a booking to a new time slot |

### GitHub Tools via MCP (26 tools)

| Tool | Description |
|------|-------------|
| `github_search_repositories` | Search for repos |
| `github_get_repository` | Get repo details |
| `github_list_issues` | List issues |
| `github_create_issue` | Create a new issue |
| `github_update_issue` | Update an issue |
| `github_list_pull_requests` | List PRs |
| `github_create_pull_request` | Create a PR |
| `github_get_file_contents` | Read a file from a repo |
| `github_search_code` | Search code |
| ... and 17 more | |

### Notion Tools via MCP (21 tools)

| Tool | Description |
|------|-------------|
| `notion_search` | Search all pages |
| `notion_get_page` | Get page content |
| `notion_create_page` | Create a new page |
| `notion_update_page` | Update a page |
| `notion_query_database` | Query a database |
| `notion_create_database` | Create a database |
| ... and 15 more | |

---

## Project Structure

```
MyBot/
├── src/
│   ├── index.ts                      # Main entry point
│   ├── config/
│   │   └── index.ts                  # Config loading (zod-validated)
│   ├── channels/
│   │   ├── slack.ts                  # Slack event handlers (optional)
│   │   └── web/
│   │       ├── server.ts             # Express + WebSocket server
│   │       ├── web-adapter.ts        # Web channel adapter
│   │       ├── web-message-processor.ts
│   │       ├── encryption.ts         # API key encryption
│   │       ├── routes/
│   │       │   ├── settings.ts       # Settings REST routes (API keys)
│   │       │   └── auth.ts           # Google OAuth callback routes
│   │       └── llm/
│   │           ├── client-factory.ts # Selects provider by active key
│   │           ├── types.ts
│   │           └── providers/
│   │               ├── anthropic-provider.ts
│   │               ├── openai-provider.ts
│   │               ├── gemini-provider.ts
│   │               ├── kimi-provider.ts
│   │               └── together-provider.ts
│   ├── agents/
│   │   └── agent.ts                  # AI agent + tool orchestration
│   ├── memory/
│   │   └── database.ts               # SQLite for sessions/messages
│   ├── memory-ai/
│   │   ├── index.ts
│   │   └── mem0-client.ts            # mem0.ai cloud integration
│   ├── rag/
│   │   ├── index.ts
│   │   ├── vectorstore.ts            # ChromaDB storage
│   │   ├── embeddings.ts             # OpenAI embeddings
│   │   ├── indexer.ts                # Background message indexer
│   │   └── retriever.ts              # Semantic search
│   ├── mcp/
│   │   ├── index.ts
│   │   ├── client.ts                 # MCP client manager
│   │   ├── config.ts                 # MCP server config
│   │   └── tool-converter.ts         # MCP → LLM tool format
│   ├── tools/
│   │   ├── slack-actions.ts          # Slack API wrappers
│   │   ├── scheduler.ts              # Task scheduler (node-cron)
│   │   └── calendar/
│   │       ├── calendar-tools.ts     # Google Calendar tool definitions + executor
│   │       ├── google-calendar.ts    # Google Calendar API client (OAuth + Service Account)
│   │       ├── calcom-tools.ts       # Cal.com tool definitions + executor
│   │       └── calcom-client.ts      # Cal.com API client
│   └── utils/
│       └── logger.ts                 # Winston logger
│
├── web-frontend/                     # React + Vite frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── index.css
│   │   ├── types.ts
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts
│   │   ├── pages/
│   │   │   ├── ChatPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   └── services/
│   │       └── api.ts
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
│
├── scripts/
│   ├── setup-db.ts                   # Initialize SQLite database
│   ├── run-indexer.ts                # Manually trigger RAG indexing
│   └── test-rag.ts                   # Test RAG pipeline
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── RAG.md
│   ├── MEMORY.md
│   └── MCP.md
│
├── .env.example                      # Environment template
├── .env                              # Your local config (gitignored)
├── mcp-config.example.json           # MCP server config template
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

---

## Optional Integrations

### Enable Google Calendar (OAuth)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add `http://localhost:3001/api/auth/google/callback` as an authorised redirect URI
4. Set in `.env`:
   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
   ```
5. In Settings → Calendar, click **Connect Google Calendar** to complete the OAuth flow

Alternatively, upload a **Service Account JSON** key directly in Settings (no env vars needed).

### Enable Cal.com

1. Go to [app.cal.com/settings/developer/api-keys](https://app.cal.com/settings/developer/api-keys)
2. Create an API key
3. In Settings → Calendar, paste the Cal.com API key

### Enable Slack

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App
2. Enable **Socket Mode**
3. Add Bot Token Scopes: `app_mentions:read`, `channels:history`, `channels:read`, `chat:write`, `im:history`, `im:read`, `im:write`, `reactions:read`, `reactions:write`, `users:read`
4. Install to workspace, copy tokens
5. Set in `.env`:
   ```env
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_APP_TOKEN=xapp-...
   SLACK_USER_TOKEN=xoxp-...    # optional, for reminders
   ```

### Enable mem0 Memory

1. Sign up at [app.mem0.ai](https://app.mem0.ai)
2. Get your API key
3. Set in `.env`:
   ```env
   MEM0_API_KEY=m0-...
   MEMORY_ENABLED=true
   ```

### Enable GitHub MCP

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Create a classic token with `repo` and `issues` scopes
3. Set in `.env`:
   ```env
   GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...
   ```

### Enable Notion MCP

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Create integration and copy the token
3. Share your Notion pages with the integration
4. Set in `.env`:
   ```env
   NOTION_API_TOKEN=secret_...
   ```

---

## Troubleshooting

### Backend won't start
- Check Node.js version: `node --version` (must be 18+)
- Run `npm install` in the `MyBot` directory
- Check port 3001 is not in use

### `tsx` not found error
```bash
npm install   # reinstalls all backend deps including tsx
```

### Frontend won't start / `vite` not found
```bash
cd web-frontend && npm install
```

### "No active API key" error in chat
- Go to **Settings** → **Add API Key** → **Set Active**

### WebSocket not connecting
- Make sure the **backend is running** on port 3001
- Refresh the browser page

### MCP servers timing out (`spawn npx ENOENT`)
- Leave `GITHUB_PERSONAL_ACCESS_TOKEN` and `NOTION_API_TOKEN` empty in `.env` to disable MCP
- MCP requires `npx` to be available globally

### mem0 `window is not defined` error
- This is a known issue with the `mem0ai` npm package running in Node.js
- Leave `MEM0_API_KEY` empty to disable memory, or provide a real key to activate it

### Enable debug logging
```env
LOG_LEVEL=debug
```

---

## Scripts

```bash
# Run in development (hot reload)
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Initialize/reset the SQLite database
npm run setup-db

# Manually trigger RAG indexing
npm run index-now

# Type checking
npm run typecheck
```

---

## License

MIT — see [LICENSE](LICENSE) for details.
