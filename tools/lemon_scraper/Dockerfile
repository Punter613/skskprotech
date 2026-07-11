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
