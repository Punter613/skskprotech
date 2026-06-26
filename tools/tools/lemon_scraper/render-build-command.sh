#!/bin/sh

mkdir -p /opt/lemon_scraper

curl -L \
-o /opt/lemon_scraper/lemon_scraper \
"https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v0.1.0/lemon_scraper"

chmod +x /opt/lemon_scraper/lemon_scraper
