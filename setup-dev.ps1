# PXL Companion Dev Setup Script
# Run this after cloning to set up the development environment

param(
    [switch]$SkipConfigCopy,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "=== PXL Companion Dev Setup ===" -ForegroundColor Cyan

# Get paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigTemplate = Join-Path $ScriptDir "config-template"
$CompanionData = Join-Path $ScriptDir "companion-data"
$NodeRuntimeCache = Join-Path $ScriptDir ".cache\node-runtime"
$AppDataConfig = "$env:APPDATA\companion-nodejs\Config\v4.2"

# Step 1: Check node-runtime cache
Write-Host "`n[1/4] Checking node-runtime cache..." -ForegroundColor Yellow
if (-not (Test-Path $NodeRuntimeCache)) {
    Write-Host "  Creating .cache/node-runtime directory..." -ForegroundColor Gray
    New-Item -ItemType Directory -Path $NodeRuntimeCache -Force | Out-Null
}

$node18 = Join-Path $NodeRuntimeCache "win32-x64-18.20.8"
$node22 = Join-Path $NodeRuntimeCache "win32-x64-22.21.1"

if (-not (Test-Path "$node18\node.exe") -or -not (Test-Path "$node22\node.exe")) {
    Write-Host "  Node runtimes missing! Downloading..." -ForegroundColor Red

    # Download Node 18
    if (-not (Test-Path "$node18\node.exe")) {
        Write-Host "  Downloading Node.js 18.20.8..." -ForegroundColor Gray
        $node18Url = "https://nodejs.org/dist/v18.20.8/node-v18.20.8-win-x64.zip"
        $node18Zip = Join-Path $env:TEMP "node18.zip"
        Invoke-WebRequest -Uri $node18Url -OutFile $node18Zip
        Expand-Archive -Path $node18Zip -DestinationPath $env:TEMP -Force
        Move-Item -Path "$env:TEMP\node-v18.20.8-win-x64" -Destination $node18 -Force
        Remove-Item $node18Zip -Force
    }

    # Download Node 22
    if (-not (Test-Path "$node22\node.exe")) {
        Write-Host "  Downloading Node.js 22.21.1..." -ForegroundColor Gray
        $node22Url = "https://nodejs.org/dist/v22.21.1/node-v22.21.1-win-x64.zip"
        $node22Zip = Join-Path $env:TEMP "node22.zip"
        Invoke-WebRequest -Uri $node22Url -OutFile $node22Zip
        Expand-Archive -Path $node22Zip -DestinationPath $env:TEMP -Force
        Move-Item -Path "$env:TEMP\node-v22.21.1-win-x64" -Destination $node22 -Force
        Remove-Item $node22Zip -Force
    }

    Write-Host "  Node runtimes downloaded!" -ForegroundColor Green
} else {
    Write-Host "  Node runtimes already present" -ForegroundColor Green
}

# Step 2: Copy module environment data
Write-Host "`n[2/4] Setting up module data..." -ForegroundColor Yellow
$ModuleDataSrc = Join-Path $ConfigTemplate "module-data\pxl-timeline"
$ModuleDataDst = Join-Path $CompanionData "module-data\pxl-timeline"

if (-not (Test-Path $ModuleDataDst)) {
    New-Item -ItemType Directory -Path $ModuleDataDst -Force | Out-Null
}

if ((Test-Path "$ModuleDataSrc\timeline-environment.json") -and (-not (Test-Path "$ModuleDataDst\timeline-environment.json") -or $Force)) {
    Copy-Item "$ModuleDataSrc\timeline-environment.json" "$ModuleDataDst\timeline-environment.json" -Force
    Write-Host "  Copied timeline-environment.json" -ForegroundColor Green
} else {
    Write-Host "  Module data already exists (use -Force to overwrite)" -ForegroundColor Gray
}

# Step 3: Copy Companion config to AppData (optional)
Write-Host "`n[3/4] Setting up Companion config..." -ForegroundColor Yellow
if (-not $SkipConfigCopy) {
    if (-not (Test-Path $AppDataConfig)) {
        New-Item -ItemType Directory -Path $AppDataConfig -Force | Out-Null
    }

    $dbSrc = Join-Path $ConfigTemplate "db.sqlite"
    $dbDst = Join-Path $AppDataConfig "db.sqlite"

    if ((Test-Path $dbSrc) -and (-not (Test-Path $dbDst) -or $Force)) {
        Copy-Item $dbSrc $dbDst -Force
        Write-Host "  Copied db.sqlite to AppData" -ForegroundColor Green
    } else {
        Write-Host "  Config already exists in AppData (use -Force to overwrite)" -ForegroundColor Gray
    }
} else {
    Write-Host "  Skipped config copy (--SkipConfigCopy)" -ForegroundColor Gray
}

# Step 4: Install module dependencies
Write-Host "`n[4/4] Installing module dependencies..." -ForegroundColor Yellow
$ModuleDir = Join-Path $ScriptDir "module-local-dev\PXL-timeline-sequencer"
if (Test-Path $ModuleDir) {
    Push-Location $ModuleDir
    if (-not (Test-Path "node_modules")) {
        Write-Host "  Running npm install in module..." -ForegroundColor Gray
        npm install
    } else {
        Write-Host "  Module dependencies already installed" -ForegroundColor Green
    }
    Pop-Location
} else {
    Write-Host "  Module directory not found - run 'git submodule update --init'" -ForegroundColor Red
}

Write-Host "`n=== Setup Complete ===" -ForegroundColor Cyan
Write-Host "Run Companion with:" -ForegroundColor White
Write-Host "  node companion/dist/main.js --extra-module-path=module-local-dev --admin-address 0.0.0.0" -ForegroundColor Gray
