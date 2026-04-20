#!/bin/bash
set -e

echo "🦞 Starting O-Hiru One-Command Installer..."

# 1. Check Node
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing via NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 22
fi

# 2. Install Hiru globally
echo "Installing @kushuri12/ohiru globally..."
npm install -g @kushuri12/ohiru

# 3. Setup directories
echo "Creating openhiru directories..."
mkdir -p ~/.openhiru/gateway/sessions
mkdir -p ~/.openhiru/agents
mkdir -p ~/.openhiru/memory/knowledge

# 4. Run wizard
echo "Starting setup wizard..."
openhiru --setup

echo "✅ O-Hiru installed successfully! Run 'openhiru' to begin."
