# 🌐 ClawBot Web Interface

A modern dark-themed web interface for ClawBot AI Assistant with multi-provider LLM support.

## ✨ Features

- 💬 **Real-time Chat** - WebSocket-based instant messaging
- 🎨 **Dark Theme** - Sleek black and red design
- 🔑 **Multi-Provider Support** - OpenAI, Claude, Gemini, Kimi
- 🧠 **AI Memory** - Long-term context using mem0.ai
- 📚 **Knowledge Base** - RAG-powered Slack history search
- 🔧 **Tool Integration** - GitHub and Notion via MCP
- 🚫 **No Authentication** - Simple, single-user setup

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### 1. Install Backend Dependencies

```bash
cd "AI Project/Slack-ClawdBot"
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set:
- `WEB_ENABLED=true` (should be already set)
- `WEB_PORT=3001`
- `WEB_ENCRYPTION_KEY` - Generate a secure 32-character string
- Optional: Add default API keys or configure via web UI later

**Minimal .env for Web-Only**:
```env
WEB_ENABLED=true
WEB_PORT=3001
WEB_ENCRYPTION_KEY=your-secure-32-char-encryption-key-here
WEB_CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Optional - users can add keys via Settings
MEMORY_ENABLED=false
RAG_ENABLED=false
```

### 3. Install Frontend Dependencies

```bash
cd web-frontend
npm install
```

### 4. Start Backend Server

```bash
# From Slack-ClawdBot directory
npm run dev
```

You should see:
```
✅ Web server started
✅ Web Interface: ✅ (http://localhost:3001)
```

### 5. Start Frontend (in a new terminal)

```bash
# From web-frontend directory
npm run dev
```

You should see:
```
  ➜  Local:   http://localhost:3000
```

### 6. Open Browser

Navigate to: **http://localhost:3000**

---

## 🔧 Configuration

### Adding API Keys

1. Open the web interface
2. Click **Settings** in the navigation
3. Click **Add API Key**
4. Select provider (OpenAI, Anthropic, Gemini, Kimi)
5. Paste your API key
6. Click **Add Key**
7. Click **Set Active** to use that key

### Supported Providers

| Provider | Model | Key Format |
|----------|-------|------------|
| **OpenAI** | gpt-4o | `sk-...` |
| **Anthropic** | claude-sonnet-4 | `sk-ant-...` |
| **Google Gemini** | gemini-pro | `AI...` |
| **Kimi (Moonshot)** | moonshot-v1-8k | `sk-...` |

---

## 📂 Project Structure

```
Slack-ClawdBot/
├── src/
│   ├── channels/
│   │   ├── slack.ts              # Slack integration (optional)
│   │   └── web/                  # NEW: Web interface
│   │       ├── server.ts         # Express + WebSocket server
│   │       ├── web-adapter.ts    # Message routing
│   │       ├── encryption.ts     # API key encryption
│   │       ├── llm/              # Multi-provider LLM clients
│   │       │   ├── types.ts
│   │       │   ├── client-factory.ts
│   │       │   └── providers/
│   │       │       ├── openai-provider.ts
│   │       │       ├── anthropic-provider.ts
│   │       │       ├── gemini-provider.ts
│   │       │       └── kimi-provider.ts
│   │       └── routes/
│   │           └── settings.ts   # API key management
│   ├── agents/
│   │   └── agent.ts              # Core AI agent (unchanged)
│   ├── rag/                      # RAG system
│   ├── memory-ai/                # mem0 integration
│   └── mcp/                      # MCP protocol
│
└── web-frontend/                 # NEW: React frontend
    ├── src/
    │   ├── pages/
    │   │   ├── ChatPage.tsx      # Chat interface
    │   │   └── SettingsPage.tsx  # API key settings
    │   ├── hooks/
    │   │   └── useWebSocket.ts   # WebSocket connection
    │   ├── services/
    │   │   └── api.ts            # HTTP API client
    │   └── App.tsx               # Main app
    └── package.json
```

---

## 🎨 UI Features

### Chat Page
- Real-time messaging with WebSocket
- Typing indicators
- Message timestamps
- RAG/Memory badges showing when knowledge base or memory was used
- Clear chat button
- Automatic scrolling

### Settings Page
- Add/delete API keys
- Switch between providers
- Visual active provider indicator
- Secure key storage (encrypted in database)
- Keys never exposed to frontend after storage

---

## 🔒 Security

### API Key Encryption
- **Algorithm**: AES-256-GCM
- **Storage**: SQLite database (encrypted)
- **Key Derivation**: SHA-256 from master secret
- **Frontend**: Only sees masked preview (`sk-...abc123`)

### No Authentication
- Designed for single-user local use
- No user accounts or login required
- All API keys are global (not per-user)

⚠️ **For Production**:
- Change `WEB_ENCRYPTION_KEY` to a secure random string
- Consider adding authentication
- Use HTTPS instead of HTTP
- Restrict CORS origins

---

## 🔌 API Endpoints

### HTTP REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health check |
| `/api/settings/api-keys` | GET | List all API keys |
| `/api/settings/api-keys` | POST | Add new API key |
| `/api/settings/api-keys/:id/activate` | POST | Set key as active |
| `/api/settings/api-keys/:id` | DELETE | Delete API key |

### WebSocket

**Endpoint**: `ws://localhost:3001`

**Client → Server**:
```json
{
  "type": "chat",
  "content": "Your message here",
  "sessionId": "optional-session-id"
}
```

**Server → Client**:
```json
{
  "type": "message",
  "content": "AI response",
  "sessionId": "web:123:abc",
  "metadata": {
    "ragUsed": true,
    "sourcesCount": 3,
    "memoryUsed": true,
    "memoriesCount": 2
  }
}
```

---

## 🐛 Troubleshooting

### Backend won't start

**Error**: `No active API key configured`

**Solution**: Add an API key via Settings page or set default keys in `.env`

---

### WebSocket not connecting

**Check**:
1. Backend is running on port 3001
2. No firewall blocking WebSocket connections
3. Frontend proxy is correctly configured in `vite.config.ts`

---

### "Invalid message format" error

**Check**:
1. Frontend and backend are both running latest code
2. WebSocket message format matches expected schema
3. Check browser console for errors

---

## 📝 Development

### Backend Development

```bash
# Watch mode with auto-reload
npm run dev

# Build TypeScript
npm run build

# Run compiled code
npm start
```

### Frontend Development

```bash
cd web-frontend

# Development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 🎯 Next Steps

### Recommended Enhancements

1. **User Authentication** - Add login/signup for multi-user support
2. **File Uploads** - Support image and document uploads
3. **Voice Input** - Add speech-to-text for voice messages
4. **Export Chat** - Download conversation history
5. **Dark/Light Toggle** - Allow theme switching
6. **Mobile Responsive** - Optimize for mobile devices

---

## 📚 Additional Features

### RAG (Knowledge Base)
- Semantic search across Slack message history
- Automatically indexes channels every hour
- Works even when bot can't access live channels

### Memory (mem0)
- Remembers user preferences across sessions
- Automatically extracts facts from conversations
- Tools to view/delete memories

### MCP Integration
- **GitHub**: 26 tools (repos, issues, PRs, code)
- **Notion**: 21 tools (pages, databases, search)

---

## 💡 Tips

1. **First Time Setup**: Go to Settings → Add an API key before chatting
2. **Switch Providers**: Try different providers to compare responses
3. **RAG Badge**: Green "database" badge means knowledge base was used
4. **Memory Badge**: Blue "brain" badge means personal memory was used
5. **Clear Chat**: Use trash icon to start fresh conversation

---

## 🆘 Support

For issues or questions:
1. Check the main [README.md](README.md) for architecture details
2. Review [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design
3. Check environment variables in `.env`

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details

---

<p align="center">
  🤖 Built with React + TypeScript + Express + WebSocket
</p>
<p align="center">
  Powered by OpenAI, Anthropic Claude, Google Gemini, and Kimi
</p>
