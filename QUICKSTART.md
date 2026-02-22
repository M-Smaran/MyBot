# 🚀 Quick Start Guide

Get ClawBot running in **3 simple steps**!

---

## Step 1: Start the Backend

Open a terminal in the `Slack-ClawdBot` directory:

```bash
cd "c:\Users\User\Downloads\AI Project\Slack-ClawdBot"
npm run dev
```

**Wait for this message:**
```
✅ Web server started
✅ Web Interface: ✅ (http://localhost:3001)
```

---

## Step 2: Start the Frontend

Open a **NEW terminal** and run:

```bash
cd "c:\Users\User\Downloads\AI Project\Slack-ClawdBot\web-frontend"
npm run dev
```

**Wait for this message:**
```
➜  Local:   http://localhost:3000
```

---

## Step 3: Configure API Key

1. Open your browser to: **http://localhost:3000**
2. Click **Settings** in the top navigation
3. Click **Add API Key** button
4. Select your provider:
   - **OpenAI** - Enter your OpenAI API key (starts with `sk-`)
   - **Anthropic** - Enter your Claude API key (starts with `sk-ant-`)
   - **Gemini** - Enter your Google AI API key
   - **Kimi** - Enter your Moonshot API key
5. Click **Add Key**
6. Click **Set Active** to activate the key
7. Click **Chat** to start chatting!

---

## 🎉 That's it!

You now have:
- ✅ Dark mode chat interface (black & red theme)
- ✅ Real-time WebSocket messaging
- ✅ Multi-provider LLM support
- ✅ Secure API key storage

---

## 🔑 Where to Get API Keys

### OpenAI
1. Go to: https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy the key (starts with `sk-`)

### Anthropic Claude
1. Go to: https://console.anthropic.com/settings/keys
2. Click "Create Key"
3. Copy the key (starts with `sk-ant-`)

### Google Gemini
1. Go to: https://makersuite.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key

### Kimi (Moonshot)
1. Go to: https://platform.moonshot.cn/console/api-keys
2. Create an account
3. Generate API key

---

## 💡 Tips

- **Switch providers**: Add multiple API keys and switch between them in Settings
- **Clear chat**: Click the trash icon in the chat header to start fresh
- **Features**: The badges on AI messages show when RAG or Memory is used

---

## 🐛 Troubleshooting

**Backend won't start?**
- Check that port 3001 is not in use
- Make sure `.env` file exists

**Frontend won't start?**
- Check that port 3000 is not in use
- Make sure you ran `npm install` in the web-frontend directory

**"No active API key" error?**
- Go to Settings and add an API key
- Make sure you clicked "Set Active"

**WebSocket not connecting?**
- Make sure both backend AND frontend are running
- Refresh the browser page

---

## 📚 Full Documentation

See [WEB_INTERFACE_README.md](WEB_INTERFACE_README.md) for complete documentation including:
- Optional features (Memory, RAG, MCP)
- Security configuration
- Production deployment
- Advanced settings
