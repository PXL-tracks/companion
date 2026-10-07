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
# Companion uses one config folder per major/minor release, the latest is the last entry of ConfigReleaseDirs
$PathsFile = Join-Path $ScriptDir "shared-lib\lib\Paths.ts"
$ConfigRelease = ([regex]::Matches((Get-Content $PathsFile -Raw), "'(v\d+\.\d+)'") | Select-Object -Last 1).Groups[1].Value
$AppDataConfig = "$env:APPDATA\companion-nodejs\Config\$ConfigRelease"

# Step 1: Check node-runtime cache (read versions from assets/nodejs-versions.json)
Write-Host "`n[1/4] Checking node-runtime cache..." -ForegroundColor Yellow
if (-not (Test-Path $NodeRuntimeCache)) {
    Write-Host "  Creating .cache/node-runtime directory..." -ForegroundColor Gray
    New-Item -ItemType Directory -Path $NodeRuntimeCache -Force | Out-Null
}

$versionsFile = Join-Path $ScriptDir "assets\nodejs-versions.json"
if (-not (Test-Path $versionsFile)) {
    Write-Host "  ERROR: assets/nodejs-versions.json not found!" -ForegroundColor Red
    exit 1
}
$versions = Get-Content $versionsFile | ConvertFrom-Json
$requiredVersions = @($versions.PSObject.Properties | ForEach-Object { $_.Value })
Write-Host "  Required: $(($versions.PSObject.Properties | ForEach-Object { "$($_.Name) = $($_.Value)" }) -join ', ')" -ForegroundColor Gray

$arch = "win32-x64"

function Download-NodeRuntime($version, $destDir) {
    $dlArch = "win-x64"
    $url = "https://nodejs.org/dist/v$version/node-v$version-$dlArch.zip"
    $zipPath = Join-Path $env:TEMP "node-$version.zip"
    Write-Host "  Downloading Node.js $version from $url" -ForegroundColor Gray
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($url, $zipPath)
    $fileSize = (Get-Item $zipPath).Length
    Write-Host "  Downloaded $fileSize bytes" -ForegroundColor Gray
    Expand-Archive -Path $zipPath -DestinationPath $env:TEMP -Force
    $extractedDir = Join-Path $env:TEMP "node-v$version-$dlArch"
    if (Test-Path $destDir) { Remove-Item $destDir -Recurse -Force }
    Move-Item -Path $extractedDir -Destination $destDir -Force
    Remove-Item $zipPath -Force
}

$missingVersions = @($requiredVersions | Where-Object { -not (Test-Path (Join-Path $NodeRuntimeCache "$arch-$_\node.exe")) })
if ($missingVersions.Count -gt 0) {
    Write-Host "  Node runtimes missing! Downloading..." -ForegroundColor Red

    foreach ($version in $missingVersions) {
        Download-NodeRuntime $version (Join-Path $NodeRuntimeCache "$arch-$version")
    }

    Write-Host "  Node runtimes downloaded!" -ForegroundColor Green
} else {
    Write-Host "  Node runtimes already present ($($requiredVersions -join ' + '))" -ForegroundColor Green
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
Write-Host "Run Companion with Node.js $(Get-Content (Join-Path $ScriptDir '.node-version')) (see .node-version):" -ForegroundColor White
Write-Host "  node companion/dist/main.js --extra-module-path=module-local-dev --admin-address 0.0.0.0" -ForegroundColor Gray
