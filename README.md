# 🦊 OpenHiru

**The Autonomous AI agentic ecosystem for high-tier engineering.**

OpenHiru is a proactive AI agent designed to operate across multiple channels with long-term memory, real-time tool usage, and a modular architecture. It is built to be a resilient, complete, and autonomous digital colleague.

---

### ⚡ Core Capabilities

*   **Autonomous Engineering:** Multi-step **ReAct** reasoning with self-critique loops.
*   **3-Layer Memory:** Intelligent context routing, daily logging, and persistent knowledge distillation.
*   **Multi-Channel Gateway:** Native support for **Telegram**, Discord, WhatsApp, Signal, and Matrix.
*   **Proactive Heartbeat:** Automatic project monitoring and error detection every 30 minutes.
*   **Visual Workspace:** Live **Canvas** for rendering code, charts, and UI designs.
*   **Voice Interface:** Native **TTS/STT** support with custom wake-word listeners ("Hey OpenHiru").

### 📦 Installation

#### One-Step Setup
```bash
# Windows (PowerShell)
powershell -c "irm https://ohiru.vercel.app/install.ps1 | iex"

# Linux / macOS
curl -fsSL https://ohiru.vercel.app/install.sh | bash
```

### 🛠️ CLI Reference

| Command | Action |
| :--- | :--- |
| `openhiru` | Start the primary Telegram agent |
| `openhiru --setup` | Configure AI providers and bot tokens |
| `openhiru doctor` | Run system health and dependency checks |
| `openhiru gateway <start\|stop>` | Manage the WebSocket control plane |
| `openhiru dashboard start` | Launch the web-based monitoring UI |
| `openhiru memory distill` | Manually compress and optimize project memory |
| `openhiru settings` | Open the interactive TUI configuration menu |

### 🧩 Modules

*   **Agent Core (v1.2.3):** Optimized for low latency and high reliability with Anthropic/Google/OpenAI models.
*   **Skill Manager:** Install and manage external toolkits for specialized tasks.
*   **Plugin System:** Hot-load GitHub/NPM plugins to extend agent logic.
*   **Voice Engine:** Whisper-powered transcription and ElevenLabs integration.

---

<p align="center">
  <em>Developed with ❤️ by OpenHiru Team • v1.2.3 — State-of-the-Art.</em>
</p>
