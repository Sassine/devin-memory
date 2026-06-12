#!/usr/bin/env sh
# devin-memory v1.0.0 — installer wrapper (Linux / macOS / Git Bash on Windows)
# Usage: ./install.sh <target> [--scope project|user] [--memory project|user] [--lang en|pt-BR|es] [--agents]
set -e
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$DIR/scripts/install.js" "$@"
