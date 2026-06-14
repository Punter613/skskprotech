#!/data/data/com.termux/files/usr/bin/bash
set -e

if ! node -e "const p=require('./package.json'); process.exit(p.dependencies && p.dependencies.pdfkit ? 0 : 1)"; then
  npm install pdfkit
else
  npm install
fi

git add package.json package-lock.json
git commit -m "Add pdfkit dependency"
git push
