# 🦊 OpenHiru
*Autonomous AI Agent Ecosystem — v1.2.4*

OpenHiru is a proactive, autonomous AI agentic system designed for high-tier engineering and digital automation. It operates across multiple communication channels with specialized toolsets, persistent memory, and a modular plugin architecture.

---

### Key Features

*   **Autonomous Engineering:** Multi-step reasoning loops with self-critique capabilities.
*   **Persistent Memory:** 3-layer architecture for long-term knowledge distillation.
*   **Cross-Channel Gateway:** Native connectivity for Telegram, Discord, WhatsApp, and more.
*   **Proactive Heartbeat:** Periodic system monitoring and proactive error detection.
*   **Visual Canvas:** Integrated workspace for live UI mocks, charts, and code visualization.
*   **Voice Integration:** Whisper-based STT and ElevenLabs TTS with wake-word support.

### Quick Start

#### Installation
```bash
# Windows
powershell -c "irm https://ohiru.vercel.app/install.ps1 | iex"

# Linux / macOS
curl -fsSL https://ohiru.vercel.app/install.sh | bash
```

### CLI Command Map

| Command | Action |
| :--- | :--- |
| `openhiru` | Start the primary agent (Telegram mode) |
| `openhiru --setup` | Configure AI providers and credentials |
| `openhiru doctor` | Perform system health check |
| `openhiru gateway start` | Enable the WebSocket control plane |
| `openhiru dashboard start` | Launch the web management UI |
| `openhiru settings` | Open the interactive configuration TUI |

### Technical Specifications
*   **Engine:** Node.js ESM Architecture.
*   **Memory Models:** Hierarchical Knowledge Graph + Persistent Summaries.
*   **Plugin Support:** Hot-loadable GitHub and NPM extensions.

---

<p align="center">
  <em>Developed by OpenHiru Team. State-of-the-art autonomous intelligence.</em>
</p>
