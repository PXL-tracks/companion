param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeRuntimeCache = Join-Path $ScriptDir ".cache\node-runtime"

Write-Host "`n[1/2] Node runtimes..." -ForegroundColor Yellow
if (-not (Test-Path $NodeRuntimeCache)) {
    New-Item -ItemType Directory -Path $NodeRuntimeCache -Force | Out-Null
}

$versionsFile = Join-Path $ScriptDir "assets\nodejs-versions.json"
if (-not (Test-Path $versionsFile)) {
    Write-Host "  ERROR: assets/nodejs-versions.json not found!" -ForegroundColor Red
    exit 1
}
$versions = Get-Content $versionsFile | ConvertFrom-Json
$requiredVersions = @($versions.PSObject.Properties | ForEach-Object { $_.Value })

$arch = "win32-x64"

function Download-NodeRuntime($version, $destDir) {
    $dlArch = "win-x64"
    $url = "https://nodejs.org/dist/v$version/node-v$version-$dlArch.zip"
    $zipPath = Join-Path $env:TEMP "node-$version.zip"
    Write-Host "  Downloading Node.js $version" -ForegroundColor Gray
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($url, $zipPath)
    Expand-Archive -Path $zipPath -DestinationPath $env:TEMP -Force
    $extractedDir = Join-Path $env:TEMP "node-v$version-$dlArch"
    if (Test-Path $destDir) { Remove-Item $destDir -Recurse -Force }
    Move-Item -Path $extractedDir -Destination $destDir -Force
    Remove-Item $zipPath -Force
}

$missingVersions = @($requiredVersions | Where-Object { -not (Test-Path (Join-Path $NodeRuntimeCache "$arch-$_\node.exe")) })
foreach ($version in $missingVersions) {
    Download-NodeRuntime $version (Join-Path $NodeRuntimeCache "$arch-$version")
}
Write-Host "  OK ($($requiredVersions -join ' + '))" -ForegroundColor Green

Write-Host "`n[2/2] Module dependencies..." -ForegroundColor Yellow
$ModuleDir = Join-Path $ScriptDir "module-local-dev\PXL-timeline-sequencer"
if (Test-Path $ModuleDir) {
    Push-Location $ModuleDir
    if ($Force -or -not (Test-Path "node_modules")) {
        npm install
    } else {
        Write-Host "  OK" -ForegroundColor Green
    }
    Pop-Location
} else {
    Write-Host "  Module directory not found - run 'git submodule update --init'" -ForegroundColor Red
}
