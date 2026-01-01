#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
WEB_DIR="$ROOT_DIR/clients/web-overlay"
PORT=${1:-8000}

cd "$WEB_DIR"

cat <<MESSAGE
OpenSyncParty demo server running.
Open: http://localhost:$PORT/demo.html
Press Ctrl+C to stop.
MESSAGE

python3 -m http.server "$PORT"
