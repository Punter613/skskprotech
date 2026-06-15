# SKSK ProTech - Mobile Mechanic AI Estimator

An AI-powered mobile mechanic diagnostic and estimate generator built for **Samsung A15** and other Android devices. This Progressive Web App (PWA) works offline and can be installed directly to your home screen like a native app.

## Features

- **AI-Powered Estimates** - Uses Groq LLM for intelligent diagnostic analysis
- **PWA Installation** - Install to home screen on Android/iOS (works offline)
- **Samsung A15 Optimized** - Touch-friendly, responsive design
- **Offline Support** - Service worker caches app shell for offline use
- **Real-time Pricing** - Labor, parts, tax calculations
- **VIN Decoding** - Extracts year/make/model from VIN via NHTSA API
- **Customer Management** - Save and track estimates via Supabase (optional)
- **Dark Mode** - Reduced eye strain for field work

---

## Quick Start

```bash
git clone https://github.com/Punter613/skskprotech.git
cd skskprotech
npm install
cp .env.example .env
# Edit .env with your API keys
npm start
```

---

## API Keys Setup

| Service | Key | Required | Get It From |
|---------|-----|----------|-------------|
| Groq AI | `GROQ_API_KEY` | **Yes** | https://console.groq.com |
| Supabase | `SUPABASE_URL` + `SUPABASE_KEY` | No | https://supabase.com |
| Stripe | `STRIPE_SECRET_KEY` | No | https://stripe.com |

---

## API Endpoints

### `POST /api/estimate`
Generate AI repair estimate.

**Request:**
```json
{
  "customer": { "name": "John", "phone": "555-0123", "email": "john@example.com" },
  "vehicle": { "year": "2008", "make": "Ford", "model": "F150", "trim": "XLT" },
  "obdCodes": ["P0300", "P0171"],
  "customerStates": ["Engine knocking", "Poor acceleration"],
  "mechanicNotices": ["Spark plugs fouled"],
  "laborRate": 65,
  "partsCost": 80,
  "vin": "1FTPX14V87FA12345"
}
```

### `POST /api/diagnose`
AI-powered diagnostic analysis.

### `POST /api/invoice`
Generate professional PDF invoice.

### `GET /health`
Server health status with DB/AI config check.

---

## Project Structure

```
skskprotech/
├── index.html                    # PWA frontend (single page)
├── server.js                     # Express backend with CORS, security headers
├── sw.js                         # Service worker for offline support
├── manifest.json                 # PWA app manifest
├── package.json                  # Dependencies
├── .env.example                  # Environment variables template
├── .gitignore                    # Git ignore rules
├── apply_update.sh               # Safe update script (Termux)
├── fix_supabase.sh               # Supabase connection fix (safe)
├── install_pdfkit.sh             # PDFKit install helper
├── src/
│   ├── routes/
│   │   ├── estimate.js           # AI estimate generation
│   │   ├── diagnose.js           # AI diagnostic analysis
│   │   ├── invoice.js            # PDF invoice generation
│   │   └── payments.js           # Stripe payments (lazy-loaded)
│   └── services/
│       ├── groq.js               # Shared Groq LLM client with caching
│       ├── db.js                 # Supabase client (safe fallback)
│       ├── vin.js                # VIN decoder (NHTSA API + local)
│       └── pdf.js                # PDF generation engine
└── functions/api/                # Cloudflare Pages functions
    ├── estimate.js
    ├── diagnose.js
    └── invoice.js
```

---

## Deployment

### Backend (Node.js)

**Render (recommended)**
```bash
git push origin main
# Connect repo at render.com, set env vars in dashboard
```

**Self-hosted / Termux**
```bash
./apply_update.sh   # Pull, install, verify
npm start           # Start server
```

### Frontend (PWA)

**Cloudflare Pages**
```bash
wrangler pages deploy .
```

**Any static host**
Upload `index.html`, `sw.js`, `manifest.json` and the `icons/` folder.

---

## What's Fixed & Optimized

### Critical Fixes
- **HTML regex bug** - `splitLines()` had a broken multiline regex that crashed JavaScript
- **Missing dotenv** - `.env` file was never loaded, all API keys were undefined
- **CORS not configured** - `cors` package installed but never used, causing cross-origin failures
- **Stripe crash on startup** - App crashed if `STRIPE_SECRET_KEY` was missing; now lazy-loads gracefully
- **Destructive shell scripts** - `apply_update.sh` and `fix_supabase.sh` overwrote working AI code with stubs

### Efficiency Optimizations
- **Shared Groq service** - Eliminated duplicate `groqChat()` code in estimate/diagnose routes
- **Groq response caching** - Identical prompts are cached for 5 minutes to reduce API costs
- **Real VIN decoding** - Extracts model year from VIN position 10, calls NHTSA API for full decode
- **Improved PDF invoices** - Professional layout with branded header, itemized charges, styled footer
- **Security headers** - Added X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- **Request timeouts** - All routes have 30s timeout with graceful error handling
- **Graceful shutdown** - Handles SIGTERM/SIGINT for clean server restarts
- **Health check** - Returns status of DB, Stripe, and Groq configuration

---

## License

ISC - See LICENSE file

Made for mobile mechanics everywhere
