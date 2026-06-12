#!/usr/bin/env sh
# devin-memory v1.0.0 — uninstaller wrapper (Linux / macOS / Git Bash on Windows)
# Usage: ./uninstall.sh <target> [--scope project|user] [--purge] [--yes]
set -e
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$DIR/scripts/uninstall.js" "$@"
