#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "[pdfkit] Checking pdfkit dependency..."
if ! node -e "const p=require('./package.json'); process.exit(p.dependencies && p.dependencies.pdfkit ? 0 : 1)" 2>/dev/null; then
  echo "[pdfkit] Installing pdfkit..."
  npm install pdfkit
  git add package.json package-lock.json
  git diff --cached --quiet || git commit -m "Add pdfkit dependency"
  git push
  echo "[pdfkit] Installed and committed!"
else
  echo "[pdfkit] Already installed"
fi
