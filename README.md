<h1 align="center">
  O-Hiru CLI
</h1>

<p align="center">
  <strong>Agentic Coding Assistant for Your Terminal</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kushuri12/ohiru">
    <img src="https://img.shields.io/npm/v/@kushuri12/ohiru.svg?style=flat-square" alt="NPM Version" />
  </a>
  <a href="https://nodejs.org">
    <img src="https://img.shields.io/badge/node_version-%3E%3D_18-brightgreen.svg?style=flat-square" alt="Node Version" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License" />
  </a>
</p>

---

## ⚡ Overview

**O-Hiru CLI** is a powerful, AI-driven coding assistant built explicitly for your terminal. Designed to increase your development speed and accuracy, O-Hiru integrates directly with your local workspace, reads code context, analyzes project directories, and even automates desktop workflows—bringing an interactive, highly-capable AI companion right to where you type.

Whether you're debugging tricky logic, bootstrapping a new project, or parsing complex logs, O-Hiru steps in to help you code smarter.

## ✨ Features

- 🧠 **Multi-Provider LLM Ecosystem:** Seamlessly connects with leading AI providers, including OpenAI, Anthropic, Google Gemini, Mistral, Groq, Cohere, and local inference via Ollama.
- 📁 **Context-Aware:** Deeply reads into your workspaces to understand exactly what you are building. It analyzes directories, fetches repository structures, and reads code intelligently.
- 💻 **Desktop Automation:** Out-of-the-box support for visual analysis! Take screenshots, navigate your OS, or automate UI tests effortlessly using `nut.js`. 
- 🎨 **Beautiful TUI:** Built using React for the terminal (via Ink), O-Hiru sports modern styling, interactive chats, markdown rendering, and animated loading indicators.
- 🛡️ **Memory Guard:** Includes sophisticated loop detection, checkpoint management, and context window compacting to ensure the AI never loses track of long coding sessions.
- 📱 **Telegram Bridge:** Control or get notified by your AI assistant straight from Telegram using built-in integrations.

## 🚀 Installation

Ensure you have **Node.js (v18 or higher)** installed on your system.

### Option 1: Install via NPM (Recommended)
You can directly install O-Hiru globally using NPM:
```bash
npm install -g @kushuri12/ohiru
```

### Option 2: Mac / Linux Auto-Installer
```bash
curl -fsSL https://o-hiru.ai/install.sh | bash
```

### Option 3: Windows PowerShell
```powershell
powershell -c "irm https://o-hiru.ai/install.ps1 | iex"
```

## 🛠️ Getting Started

Once installed, simply run the assistant from any directory in your terminal:

```bash
hiru
```

On first startup, O-Hiru will launch the **Setup Wizard** to help you configure your preferred AI provider and API keys securely into your local keychain.

### Basic Commands
Inside the interactive O-Hiru session, you can converse naturally or use slash-commands:
- `/help` — List all available commands.
- `/config` — Switch AI models or update API keys.
- `/clear` — Reset your current conversaton context.
- `/exit` — Close the assistant.

## 📦 Development

Want to compile or contribute to the project? Follow these steps:

1. Clone the repository
2. Install monorepo dependencies:
   ```bash
   npm install
   ```
3. Build the CLI package:
   ```bash
   npm run build
   ```
4. Run in development mode:
   ```bash
   npm run dev
   ```

## 🔐 Privacy & Security

O-Hiru prioritizes your privacy. API keys are safely held in your OS-native secure keychain (`keytar`/keychain integration) rather than plain-text files. It only scans context within the directory where it's launched.

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
