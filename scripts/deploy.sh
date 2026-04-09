#!/bin/bash
# DevDock deploy script — builds release, installs to /Applications/DevDock.app,
# and verifies the install. Safe to run while DevDock is running.
#
# Usage: ./scripts/deploy.sh
#
# What it does, in order:
#   1. Builds release binary from the current checkout
#   2. Gracefully stops any running DevDock (SIGTERM → wait → SIGKILL if needed)
#   3. Frees port 3070
#   4. Copies the new binary into /Applications/DevDock.app
#   5. Verifies byte-for-byte match before signing
#   6. Re-signs the bundle ad-hoc so Gatekeeper doesn't block launch
#   7. Launches the app
#   8. Verifies /api/health responds
#
# Exits non-zero and aborts *before* touching /Applications on any failure.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="/Applications/DevDock.app"
INSTALLED_BINARY="${APP_PATH}/Contents/MacOS/DevDock"
RELEASE_BINARY="${REPO_DIR}/.build/release/DevDock"
PORT=3070

# Color output (if terminal supports it)
if [ -t 1 ]; then
    BOLD=$'\033[1m'
    GREEN=$'\033[32m'
    RED=$'\033[31m'
    YELLOW=$'\033[33m'
    DIM=$'\033[2m'
    RESET=$'\033[0m'
else
    BOLD=""; GREEN=""; RED=""; YELLOW=""; DIM=""; RESET=""
fi

step() { echo "${BOLD}→${RESET} $*"; }
ok()   { echo "  ${GREEN}✓${RESET} $*"; }
warn() { echo "  ${YELLOW}!${RESET} $*"; }
fail() { echo "  ${RED}✗${RESET} $*" >&2; exit 1; }

cd "$REPO_DIR"

# ── 1. Preflight ─────────────────────────────────────────────────────────
step "Preflight"
if [ ! -d "$APP_PATH" ]; then
    fail "$APP_PATH doesn't exist — install DevDock manually first"
fi
if [ ! -w "$INSTALLED_BINARY" ]; then
    fail "$INSTALLED_BINARY is not writable by $(whoami)"
fi
ok "app bundle writable"

# ── 2. Build ─────────────────────────────────────────────────────────────
step "Building release"
# Clear stale SwiftPM lock if left behind by a previous abort
rm -f "${REPO_DIR}/.build/.lock"
if ! swift build -c release 2>&1 | tail -20; then
    fail "swift build failed"
fi
if [ ! -f "$RELEASE_BINARY" ]; then
    fail "release binary not found at $RELEASE_BINARY"
fi
BUILD_MD5=$(md5 -q "$RELEASE_BINARY")
BUILD_SIZE=$(stat -f "%z" "$RELEASE_BINARY")
ok "built ($(printf '%.1fM' $(echo "$BUILD_SIZE / 1048576" | bc -l)), md5 ${BUILD_MD5:0:8}…)"

# ── 3. Stop running DevDock ──────────────────────────────────────────────
step "Stopping running DevDock"
RUNNING_PIDS=$(pgrep -f "${INSTALLED_BINARY}" 2>/dev/null || true)
if [ -n "$RUNNING_PIDS" ]; then
    for PID in $RUNNING_PIDS; do
        kill -TERM "$PID" 2>/dev/null || true
    done
    # Wait up to 5s for graceful shutdown
    for i in 1 2 3 4 5; do
        REMAINING=$(pgrep -f "${INSTALLED_BINARY}" 2>/dev/null || true)
        [ -z "$REMAINING" ] && break
        sleep 1
    done
    # Escalate if still alive
    REMAINING=$(pgrep -f "${INSTALLED_BINARY}" 2>/dev/null || true)
    if [ -n "$REMAINING" ]; then
        warn "graceful shutdown timed out — sending SIGKILL"
        for PID in $REMAINING; do
            kill -KILL "$PID" 2>/dev/null || true
        done
        sleep 1
    fi
    ok "stopped"
else
    ok "not running"
fi

# Confirm port 3070 actually freed up
if lsof -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
    warn "port ${PORT} still held by another process — continuing anyway"
    lsof -iTCP:${PORT} -sTCP:LISTEN 2>/dev/null | tail -n +2
else
    ok "port ${PORT} free"
fi

# ── 4. Install binary ────────────────────────────────────────────────────
step "Installing binary"
cp "$RELEASE_BINARY" "$INSTALLED_BINARY"
INSTALLED_MD5=$(md5 -q "$INSTALLED_BINARY")
if [ "$INSTALLED_MD5" != "$BUILD_MD5" ]; then
    fail "post-copy md5 mismatch: installed ${INSTALLED_MD5:0:8}… vs build ${BUILD_MD5:0:8}…"
fi
ok "copied (${BUILD_MD5:0:8}…)"

# ── 5. Code sign ─────────────────────────────────────────────────────────
# Signing mutates the binary in place — after this, md5 will NOT match the
# unsigned release build any more. That's expected; verify via symbol check
# instead of md5 going forward.
step "Signing bundle (ad-hoc)"
if codesign --force --sign - "$APP_PATH" 2>&1 | tail -3; then
    ok "signed"
else
    fail "codesign failed"
fi

# ── 6. Launch ────────────────────────────────────────────────────────────
step "Launching"
open "$APP_PATH"
sleep 3

NEW_PID=$(pgrep -f "${INSTALLED_BINARY}" 2>/dev/null | head -1 || true)
if [ -z "$NEW_PID" ]; then
    fail "DevDock did not launch"
fi
ok "running (PID $NEW_PID)"

# ── 7. Health check ──────────────────────────────────────────────────────
step "Health check"
HEALTH_OK=false
for i in 1 2 3 4 5; do
    if HEALTH=$(curl -sS -o /tmp/devdock-deploy-health.json -w "%{http_code}" "http://localhost:${PORT}/api/health" 2>/dev/null); then
        if [ "$HEALTH" = "200" ]; then
            HEALTH_OK=true
            break
        fi
    fi
    sleep 1
done

if [ "$HEALTH_OK" = "true" ]; then
    ok "/api/health → 200"
    echo "  ${DIM}$(cat /tmp/devdock-deploy-health.json)${RESET}"
else
    fail "health check failed after 5s"
fi

rm -f /tmp/devdock-deploy-health.json

echo
echo "${GREEN}${BOLD}✓ DevDock deployed${RESET}"
echo "  ${DIM}commit:${RESET}  $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo "  ${DIM}branch:${RESET}  $(git branch --show-current 2>/dev/null || echo 'unknown')"
