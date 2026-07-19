#!/bin/bash

echo "======================================="
echo " SKSK ProTech Render Deployment Setup "
echo "======================================="

# -----------------------------
# Dockerfile
# -----------------------------
cat > Dockerfile <<'DOCKER'
# Stage 1 Build Rust scraper
FROM rust:1.71 as builder

WORKDIR /workspace

COPY tools/lemon_scraper ./tools/lemon_scraper

RUN cd tools/lemon_scraper && cargo build --release

# Stage 2 Build Node App
FROM node:20-alpine AS nodebuilder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build || true

# Stage 3 Runtime
FROM node:20-alpine

RUN addgroup -S sksk && adduser -S -G sksk sksk

WORKDIR /app

COPY --from=nodebuilder /app .

COPY --from=builder \
/workspace/tools/lemon_scraper/target/release/lemon_scraper \
/opt/lemon_scraper/lemon_scraper

RUN chown -R sksk:sksk /opt/lemon_scraper \
 && chmod +x /opt/lemon_scraper/lemon_scraper

USER sksk

ENV LEMON_PATH=/opt/lemon_scraper/lemon_scraper
ENV PORT=10000

EXPOSE 10000

CMD ["node","server.js"]
DOCKER

echo "[+] Dockerfile created"

# -----------------------------
# render.yaml
# -----------------------------
cat > render.yaml <<'RENDER'
services:
  - type: web
    name: sksk-backend
    env: docker
    dockerfilePath: Dockerfile
    plan: starter

    buildCommand: ""

    startCommand: node server.js

    envVars:
      - key: PORT
        value: "10000"

      - key: LEMON_PATH
        value: "/opt/lemon_scraper/lemon_scraper"

      - key: NODE_ENV
        value: "production"

    healthCheckPath: /health
    autoDeploy: true

  - type: worker
    name: sksk-scraper-worker
    env: docker
    dockerfilePath: Dockerfile
    plan: starter

    buildCommand: ""

    startCommand: node worker/scrape-worker.js

    envVars:
      - key: LEMON_PATH
        value: "/opt/lemon_scraper/lemon_scraper"

      - key: NODE_ENV
        value: "production"

    autoDeploy: true
RENDER

echo "[+] render.yaml created"

# -----------------------------
# scraper install helper
# -----------------------------
mkdir -p scripts

cat > scripts/install_scraper.sh <<'INSTALL'
#!/bin/bash

mkdir -p /opt/lemon_scraper

curl -L \
-o /opt/lemon_scraper/lemon_scraper \
"https://github.com/your/repo/releases/download/v0.1.0/lemon_scraper"

chmod +x /opt/lemon_scraper/lemon_scraper

echo "Installed:"
/opt/lemon_scraper/lemon_scraper --help || true
INSTALL

chmod +x scripts/install_scraper.sh

echo "[+] install_scraper.sh created"

echo ""
echo "======================================="
echo "FILES GENERATED"
echo "======================================="
echo "Dockerfile"
echo "render.yaml"
echo "scripts/install_scraper.sh"
echo ""
echo "Next:"
echo "git add ."
echo "git commit -m 'Render deployment setup'"
echo "git push origin main"
echo "======================================="
