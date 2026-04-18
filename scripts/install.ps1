Write-Host "🦞 Starting O-Hiru Windows Installer..." -ForegroundColor Cyan

# 1. Check Node
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Please install it from nodejs.org" -ForegroundColor Red
    return
}

# 2. Install Hiru globally
Write-Host "Installing @kushuri12/ohiru globally..." -ForegroundColor Gray
npm install -g @kushuri12/ohiru

# 3. Setup directories
$hiruDir = Join-Path $HOME ".hiru"
New-Item -ItemType Directory -Force -Path (Join-Path $hiruDir "gateway\sessions")
New-Item -ItemType Directory -Force -Path (Join-Path $hiruDir "agents")

# 4. Run wizard
hiru --setup

Write-Host "✅ O-Hiru installed successfully! Run 'hiru' to begin." -ForegroundColor Green
