#!/bin/bash

mkdir -p /opt/lemon_scraper

curl -L \
-o /opt/lemon_scraper/lemon_scraper \
"https://github.com/your/repo/releases/download/v0.1.0/lemon_scraper"

chmod +x /opt/lemon_scraper/lemon_scraper

echo "Installed:"
/opt/lemon_scraper/lemon_scraper --help || true
