#!/bin/bash
# PXL Tracks - Complete Setup and Start Script (macOS/Linux)
# Usage: ./pxl-start.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Detect if we're inside the repo or outside
if [ -f "$SCRIPT_DIR/package.json" ]; then
    # Script is in repo root
    REPO_DIR="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/companion/package.json" ]; then
    # Script is outside repo
    REPO_DIR="$SCRIPT_DIR/companion"
else
    # Repo doesn't exist yet, will be cloned
    REPO_DIR="$SCRIPT_DIR/companion"
fi

echo "======================================"
echo "       PXL TRACKS LAUNCHER            "
echo "======================================"
echo "Repo: $REPO_DIR"

# Step 1: Clone if needed
echo ""
echo "[1/6] Checking repository..."
if [ ! -d "$REPO_DIR/.git" ]; then
    echo "  Cloning from GitHub..."
    git clone --recurse-submodules https://github.com/PXL-tracks/companion.git "$REPO_DIR"
    cd "$REPO_DIR"
    git checkout pxl-stable
else
    echo "  Repository already exists"
    cd "$REPO_DIR"
fi

# Step 2: Update submodules
echo ""
echo "[2/6] Updating submodules..."
MODULE_DIR="$REPO_DIR/module-local-dev/PXL-timeline-sequencer"
if [ ! -f "$MODULE_DIR/main.js" ]; then
    echo "  Cloning module..."
    rm -rf "$MODULE_DIR" 2>/dev/null || true
    git clone https://github.com/PXL-tracks/timeline-sequencer.git "$MODULE_DIR"
else
    echo "  Module already present"
fi

# Step 3: Install dependencies
echo ""
echo "[3/6] Installing dependencies..."
if [ ! -d "$REPO_DIR/node_modules" ]; then
    yarn install
else
    echo "  Dependencies already installed"
fi

# Step 4: Build
echo ""
echo "[4/6] Building..."
MAIN_JS="$REPO_DIR/companion/dist/main.js"
if [ ! -f "$MAIN_JS" ]; then
    echo "  Building shared-lib..."
    yarn workspace @companion-app/shared build

    echo "  Building companion TypeScript..."
    cd "$REPO_DIR/companion"
    npx tsc --skipLibCheck 2>/dev/null || true
    cd "$REPO_DIR"

    echo "  Building WebUI..."
    yarn workspace @companion-app/webui build

    echo "  Building Webpack..."
    npx webpack --config companion/webpack.config.js
else
    echo "  Already built"
fi

# Step 5: Setup node runtimes and config
echo ""
echo "[5/6] Running setup..."
# Detect platform
PLATFORM="$(uname -s)"
ARCH="$(uname -m)"
if [ "$PLATFORM" = "Darwin" ]; then
    if [ "$ARCH" = "arm64" ]; then
        NODE_RUNTIME="$REPO_DIR/.cache/node-runtime/darwin-arm64-18.20.8/node"
    else
        NODE_RUNTIME="$REPO_DIR/.cache/node-runtime/darwin-x64-18.20.8/node"
    fi
else
    NODE_RUNTIME="$REPO_DIR/.cache/node-runtime/linux-x64-18.20.8/node"
fi

if [ ! -f "$NODE_RUNTIME" ]; then
    if [ -f "$REPO_DIR/setup-dev.sh" ]; then
        bash "$REPO_DIR/setup-dev.sh"
    elif [ -f "$REPO_DIR/setup-dev.ps1" ]; then
        echo "  Running yarn dev to setup runtimes..."
        # On Mac/Linux, we need to trigger the runtime download
        timeout 30 yarn dev --admin-address 0.0.0.0 2>/dev/null || true
    fi
else
    echo "  Node runtimes already present"
    CONFIG_SRC="$REPO_DIR/config-template/module-data/pxl-timeline/timeline-environment.json"
    CONFIG_DST="$REPO_DIR/companion-data/module-data/pxl-timeline"
    if [ -f "$CONFIG_SRC" ] && [ ! -f "$CONFIG_DST/timeline-environment.json" ]; then
        mkdir -p "$CONFIG_DST"
        cp "$CONFIG_SRC" "$CONFIG_DST/"
        echo "  Copied environment config"
    fi
fi

# Step 6: Install module deps
echo ""
echo "[6/6] Module dependencies..."
if [ ! -d "$MODULE_DIR/node_modules" ]; then
    cd "$MODULE_DIR"
    npm install
    cd "$REPO_DIR"
else
    echo "  Module dependencies already installed"
fi

# Start
echo ""
echo "=== Starting PXL Tracks ==="
echo "URL: http://localhost:8000"
echo "Press Ctrl+C to stop"
echo ""

cd "$REPO_DIR"
node companion/dist/main.js --extra-module-path=module-local-dev --admin-address 0.0.0.0 --log-level info
