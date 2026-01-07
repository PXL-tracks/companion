# PXL Tracks - Complete Setup and Start Script
# Usage: .\pxl-start.ps1

param(
    [switch]$SkipBuild,
    [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Detect if we're inside the repo or outside
if (Test-Path "$ScriptDir\package.json") {
    # Script is in repo root (C:\PXL\Tracks\companion)
    $RepoDir = $ScriptDir
} elseif (Test-Path "$ScriptDir\companion\package.json") {
    # Script is outside repo (C:\PXL\Tracks)
    $RepoDir = Join-Path $ScriptDir "companion"
} else {
    # Repo doesn't exist yet, will be cloned
    $RepoDir = Join-Path $ScriptDir "companion"
}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "       PXL TRACKS LAUNCHER            " -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Repo: $RepoDir" -ForegroundColor Gray

# Step 1: Clone if needed
Write-Host ""
Write-Host "[1/6] Checking repository..." -ForegroundColor Yellow
if (-not (Test-Path "$RepoDir\.git")) {
    Write-Host "  Cloning from GitHub..." -ForegroundColor Gray
    git clone --recurse-submodules https://github.com/PXL-tracks/companion.git $RepoDir
    Set-Location $RepoDir
    git checkout pxl-stable
} else {
    Write-Host "  Repository already exists" -ForegroundColor Green
    Set-Location $RepoDir
}

# Step 2: Update submodules
Write-Host ""
Write-Host "[2/6] Updating submodules..." -ForegroundColor Yellow
$ModuleDir = Join-Path $RepoDir "module-local-dev\PXL-timeline-sequencer"
if (-not (Test-Path "$ModuleDir\main.js")) {
    Write-Host "  Cloning module..." -ForegroundColor Gray
    if (Test-Path $ModuleDir) { Remove-Item $ModuleDir -Recurse -Force }
    git clone https://github.com/PXL-tracks/timeline-sequencer.git $ModuleDir 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host ""
        Write-Host "  ██████╗ ██╗  ██╗██╗         ███╗   ███╗███████╗████████╗██████╗ ███████╗" -ForegroundColor Magenta
        Write-Host "  ██╔══██╗╚██╗██╔╝██║         ████╗ ████║██╔════╝╚══██╔══╝██╔══██╗██╔════╝" -ForegroundColor Magenta
        Write-Host "  ██████╔╝ ╚███╔╝ ██║         ██╔████╔██║███████╗   ██║   ██████╔╝███████╗" -ForegroundColor Magenta
        Write-Host "  ██╔═══╝  ██╔██╗ ██║         ██║╚██╔╝██║╚════██║   ██║   ██╔══██╗╚════██║" -ForegroundColor Magenta
        Write-Host "  ██║     ██╔╝ ██╗███████╗    ██║ ╚═╝ ██║███████║   ██║   ██║  ██║███████║" -ForegroundColor Magenta
        Write-Host "  ╚═╝     ╚═╝  ╚═╝╚══════╝    ╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝" -ForegroundColor Magenta
        Write-Host ""
        Write-Host "  ╔══════════════════════════════════════════════════════════════════════╗" -ForegroundColor Red
        Write-Host "  ║                                                                      ║" -ForegroundColor Red
        Write-Host "  ║   [!] ACCESS DENIED                                                  ║" -ForegroundColor Red
        Write-Host "  ║                                                                      ║" -ForegroundColor Red
        Write-Host "  ║   > Private repository authentication failed                         ║" -ForegroundColor DarkGray
        Write-Host "  ║   > You need authorized access to PXL-tracks/timeline-sequencer      ║" -ForegroundColor DarkGray
        Write-Host "  ║                                                                      ║" -ForegroundColor Red
        Write-Host "  ║   Contact: Ifightfortheusers@pxlmasters.com                           ║" -ForegroundColor Cyan
        Write-Host "  ║                                                                      ║" -ForegroundColor Red
        Write-Host "  ╚══════════════════════════════════════════════════════════════════════╝" -ForegroundColor Red
        Write-Host ""
        Write-Host "  Session terminated." -ForegroundColor DarkGray
        Write-Host ""
        exit 1
    }
} else {
    Write-Host "  Module already present" -ForegroundColor Green
}

if (-not $SkipBuild) {
    # Step 3: Install dependencies
    Write-Host ""
    Write-Host "[3/6] Installing dependencies..." -ForegroundColor Yellow
    if (-not (Test-Path "$RepoDir\node_modules")) {
        yarn install
    } else {
        Write-Host "  Dependencies already installed" -ForegroundColor Green
    }

    # Step 4: Build
    Write-Host ""
    Write-Host "[4/6] Building..." -ForegroundColor Yellow
    $MainJs = Join-Path $RepoDir "companion\dist\main.js"
    if (-not (Test-Path $MainJs)) {
        Write-Host "  Building shared-lib..." -ForegroundColor Gray
        yarn workspace @companion-app/shared build

        Write-Host "  Building companion TypeScript..." -ForegroundColor Gray
        Push-Location (Join-Path $RepoDir "companion")
        npx tsc --skipLibCheck 2>$null
        Pop-Location

        Write-Host "  Building WebUI..." -ForegroundColor Gray
        yarn workspace @companion-app/webui build

        Write-Host "  Building Webpack..." -ForegroundColor Gray
        npx webpack --config companion/webpack.config.js
    } else {
        Write-Host "  Already built" -ForegroundColor Green
    }
} else {
    Write-Host ""
    Write-Host "[3-4/6] Skipping build..." -ForegroundColor Gray
}

# Step 5: Setup node runtimes and config
Write-Host ""
Write-Host "[5/6] Running setup..." -ForegroundColor Yellow
$NodeRuntime = Join-Path $RepoDir ".cache\node-runtime\win32-x64-18.20.8\node.exe"
if (-not (Test-Path $NodeRuntime)) {
    $SetupScript = Join-Path $RepoDir "setup-dev.ps1"
    if (Test-Path $SetupScript) {
        & $SetupScript -Force
    } else {
        Write-Host "  setup-dev.ps1 not found!" -ForegroundColor Red
    }
} else {
    Write-Host "  Node runtimes already present" -ForegroundColor Green
    $ConfigSrc = Join-Path $RepoDir "config-template\module-data\pxl-timeline\timeline-environment.json"
    $ConfigDst = Join-Path $RepoDir "companion-data\module-data\pxl-timeline"
    if ((Test-Path $ConfigSrc) -and (-not (Test-Path "$ConfigDst\timeline-environment.json"))) {
        New-Item -ItemType Directory -Path $ConfigDst -Force | Out-Null
        Copy-Item $ConfigSrc $ConfigDst -Force
        Write-Host "  Copied environment config" -ForegroundColor Green
    }
}

# Step 6: Install module deps
Write-Host ""
Write-Host "[6/6] Module dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "$ModuleDir\node_modules")) {
    Push-Location $ModuleDir
    npm install
    Pop-Location
} else {
    Write-Host "  Module dependencies already installed" -ForegroundColor Green
}

if ($BuildOnly) {
    Write-Host ""
    Write-Host "=== Build Complete ===" -ForegroundColor Cyan
    exit 0
}

# Start
Write-Host ""
Write-Host "=== Starting PXL Tracks ===" -ForegroundColor Cyan
Write-Host "URL: http://localhost:8000" -ForegroundColor White
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

Set-Location $RepoDir
node companion/dist/main.js --extra-module-path=module-local-dev --admin-address 0.0.0.0 --log-level info
