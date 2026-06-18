#!/usr/bin/env bash
set -euo pipefail
TOOLS_DIR="${TOOLS_DIR:-$HOME/skskprotech/tools/lemon_scraper}"
cd "$TOOLS_DIR"
# build if needed, then run with optional URL argument
cargo build --release
./target/release/lemon_scraper "${1:-}"
