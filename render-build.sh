#!/usr/bin/env bash
set -e

echo "Render build script: install deps and build web client if present"

# Install root deps
npm ci

# If web client exists, build it (assumes simple static files for now)
if [ -d "web" ]; then
  echo "Building web client (if present)..."
  # If web has its own package.json
  if [ -f "web/package.json" ]; then
    (cd web && npm ci && npm run build)
  else
    echo "No web build step configured"
  fi
fi

echo "Build complete"
