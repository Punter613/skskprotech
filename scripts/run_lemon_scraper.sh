#!/usr/bin/env bash
set -euo pipefail
TOOLS_DIR="${TOOLS_DIR:-$HOME/skskprotech/tools/lemon_scraper}"
cd "$TOOLS_DIR"

cargo build --release

# Only pass the argument if the user actually typed one in
if [ -n "${1:-}" ]; then
    ./target/release/lemon_scraper "$1"
else
    ./target/release/lemon_scraper
fi
