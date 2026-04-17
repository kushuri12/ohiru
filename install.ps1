# O-Hiru CLI Installation Script for Windows
# Usage: powershell -c "irm https://o-hiru.ai/install.ps1 | iex"

$ErrorActionPreference = "Stop"

function Write-Color([String]$Message, [ConsoleColor]$Color) {
    Write-Host $Message -ForegroundColor $Color
}

Write-Color "" Cyan
Write-Color "    ____       __  ___" Cyan
Write-Color "   / __ \     / / / (_)______  __" Cyan
Write-Color "  / / / /____/ /_/ / / ___/ / / /" Cyan
Write-Color " / /_/ /____/ __  / / /  / /_/ / " Cyan
Write-Color " \____/    /_/ /_/_/_/   \__,_/  " Cyan
Write-Color "" Cyan
Write-Color " Installing O-Hiru CLI..." Cyan
Write-Color "=========================================" Cyan
Write-Color "" Cyan

# 1. Check for Node.js
try {
    $nodeVersion = (node -v 2>$null)
    if (-not $nodeVersion) { throw "Not Found" }
    Write-Color "[OK] Node.js detected: $nodeVersion" Green
} catch {
    Write-Color "[ERROR] Node.js is required but not found in PATH." Red
    Write-Color "Please install Node.js (v18+) from https://nodejs.org/" Yellow
    Write-Color "If you just installed Node.js, you might need to restart your terminal." Yellow
    exit 1
}

# 2. Check for npm
try {
    $npmVersion = (npm -v 2>$null)
    if (-not $npmVersion) { throw "Not Found" }
    Write-Color "[OK] npm detected: v$npmVersion" Green
} catch {
    Write-Color "[ERROR] npm is required but not found in PATH." Red
    exit 1
}

Write-Color "" Cyan
Write-Color ">> Downloading & Installing hiru globally via npm..." Yellow

# Run the npm install command
npm install -g @kushuri12/ohiru

if ($LASTEXITCODE -ne 0) {
    Write-Color "" Red
    Write-Color "[ERROR] Installation failed. Please check the output above." Red
    exit 1
}

Write-Color "" Green
Write-Color "==================================================" Green
Write-Color "  O-Hiru CLI successfully installed! 🎉           " Green
Write-Color "==================================================" Green
Write-Color "" Green

# Check if command is available and give helpful warnings if PATH is wrong
$hiruCmd = Get-Command hiru -ErrorAction SilentlyContinue
if (-not $hiruCmd) {
    $npmPrefix = npm config get prefix
    Write-Color "[WARNING] Installation succeeded, but the 'hiru' command is not recognized." Yellow
    Write-Color "          This usually means your npm global directory is not in your system PATH." Yellow
    Write-Color "          Please add this directory to your PATH environment variable:" Yellow
    Write-Color "          $npmPrefix" Cyan
    Write-Color "          Alternatively, you may just need to restart your terminal." Yellow
    Write-Color "" Yellow
}

Write-Color "To get started, try running:" Yellow
Write-Color "  hiru" Cyan
Write-Host ""

# PM2 Persistence Option
Write-Color ">> Want to run Hiru 24/7 in the background?" Cyan
try {
    $pm2Cmd = Get-Command pm2 -ErrorAction SilentlyContinue
    if ($pm2Cmd) {
        Write-Color "[OK] PM2 is already installed." Green
        Write-Color "To start Hiru in background: pm2 start hiru" Cyan
    } else {
        throw "Not Found"
    }
} catch {
    Write-Color "PM2 is not installed. To run 24/7 on a server:" Yellow
    Write-Color "1. Install PM2: npm install -g pm2" Cyan
    Write-Color "2. Start Hiru:  pm2 start hiru" Cyan
}
Write-Color "" Yellow
