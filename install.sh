#!/bin/sh
set -e

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "${CYAN}"
echo "    ____       __  ___"
echo "   / __ \     / / / (_)______  __"
echo "  / / / /____/ /_/ / / ___/ / / /"
echo " / /_/ /____/ __  / / /  / /_/ / "
echo " \____/    /_/ /_/_/_/   \__,_/  "
echo ""
echo " Installing O-Hiru CLI..."
echo "=========================================${NC}"
echo ""

# 1. Check for Node.js
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node -v)
    echo "${GREEN}[OK] Node.js detected: $NODE_VERSION${NC}"
else
    echo "${RED}[ERROR] Node.js is required but not found in PATH.${NC}"
    echo "${YELLOW}Please install Node.js (v18+) from https://nodejs.org/${NC}"
    echo "${YELLOW}If you just installed Node.js, you might need to restart your terminal.${NC}"
    exit 1
fi

# 2. Check for npm
if command -v npm >/dev/null 2>&1; then
    NPM_VERSION=$(npm -v)
    echo "${GREEN}[OK] npm detected: v$NPM_VERSION${NC}"
else
    echo "${RED}[ERROR] npm is required but not found in PATH.${NC}"
    exit 1
fi

echo ""
echo "${YELLOW}>> Downloading & Installing ohiru globally via npm...${NC}"

# Run the npm install command
if npm install -g @kushuri12/ohiru; then
    echo ""
    echo "${GREEN}==================================================${NC}"
    echo "${GREEN}  O-Hiru CLI successfully installed! 🎉           ${NC}"
    echo "${GREEN}==================================================${NC}"
    echo ""
else
    echo ""
    echo "${RED}[ERROR] Installation failed. Please check the output above.${NC}"
    exit 1
fi

# Check if command is available
if ! command -v hiru >/dev/null 2>&1 && ! command -v ohiru >/dev/null 2>&1; then
    NPM_PREFIX=$(npm config get prefix)
    echo "${YELLOW}[WARNING] Installation succeeded, but the 'hiru' or 'ohiru' command is not recognized.${NC}"
    echo "${YELLOW}          This usually means your npm global directory is not in your system PATH.${NC}"
    echo "${YELLOW}          Please add this directory to your PATH environment variable:${NC}"
    echo "${CYAN}          $NPM_PREFIX/bin${NC}"
    echo "${YELLOW}          Alternatively, you may just need to restart your terminal.${NC}"
    echo ""
fi

echo "${YELLOW}To get started, try running:${NC}"
echo "${CYAN}  ohiru${NC} or ${CYAN}hiru${NC}"
echo ""

# PM2 Persistence Option
echo "${CYAN}>> Want to run Hiru 24/7 in the background?${NC}"
if command -v pm2 >/dev/null 2>&1; then
    echo "${GREEN}[OK] PM2 is already installed.${NC}"
    echo "To start Hiru in background: ${CYAN}pm2 start hiru${NC}"
else
    echo "${YELLOW}PM2 is not installed. To run 24/7 on a server:${NC}"
    echo "1. Install PM2: ${CYAN}npm install -g pm2${NC}"
    echo "2. Start Hiru:  ${CYAN}pm2 start hiru${NC}"
fi
echo ""
