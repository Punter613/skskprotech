# SKSK ProTech — Mobile Mechanic AI Estimator

An AI-powered mobile mechanic diagnostic and estimate generator built for **Samsung A15** and other Android devices. This Progressive Web App (PWA) works offline and can be installed directly to your home screen like a native app.

## Features

✅ **AI-Powered Estimates** - Uses Groq LLM for intelligent diagnostic analysis  
✅ **PWA Installation** - Install to home screen on Android/iOS (works offline)  
✅ **Samsung A15 Optimized** - Touch-friendly, responsive design  
✅ **Offline Support** - Service worker caches estimates and data  
✅ **Real-time Pricing** - Labor, parts, tax calculations  
✅ **Vehicle Database** - Known issues for common vehicle models  
✅ **Customer Management** - Save and track estimates via Supabase  
✅ **Dark Mode** - Reduced eye strain for field work  

---

## Installation & Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account (optional, for data persistence)
- Groq API key (get free at https://console.groq.com)

### 1. Clone & Install

```bash
git clone https://github.com/Punter613/skskprotech.git
cd skskprotech
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

Edit `.env`:
```
GROQ_API_KEY=your_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key_here
```

### 3. Start Development Server

```bash
npm run dev
```

Server runs on `http://localhost:4000`

---

## Using on Samsung A15

### Installation as App

1. Open the app in **Chrome**, **Samsung Internet**, or **Edge** browser
2. Tap the address bar → **"Install app"** or **three dots (⋮)** → **"Install"
3. App appears on home screen as **SKSK ProTech**
4. Works completely offline after first load

### Optimal Settings

- **Display**: Full screen (standalone mode)
- **Updates**: Auto-update when online
- **Data**: Cached on device for offline use

---

## API Endpoints

### POST `/api/estimate`
Generate a repair estimate with AI analysis.

**Request:**
```json
{
  "incomingPayload": {
    "customer": {
      "name": "John Doe",
      "phone": "555-0123",
      "email": "john@example.com"
    },
    "vehicle": {
      "year": "2008",
      "make": "Ford",
      "model": "F150"
    },
    "obdCodes": ["P0300", "P0171"],
    "customerStates": ["Engine knocking", "Poor acceleration"],
    "mechanicNotices": ["Spark plugs fouled"],
    "laborRate": 65
  }
}
```

### POST `/api/diagnose`
Save a diagnostic record.

### POST `/api/invoice`
Generate an invoice from an estimate.

### GET `/health`
Check server status.

---

## Project Structure

```
skskprotech/
├── index.html              # Main PWA app (single page)
├── service-worker.js       # Offline caching & sync
├── manifest.json           # PWA app metadata
├── server.js               # Express backend
├── package.json            # Dependencies
├── .env.example            # Environment template
├── .env                    # Your secrets (DO NOT commit)
├── .gitignore              # Version control ignore list
└── README.md               # This file
```

---

## Deployment

### Backend (Express Server)

**Option 1: Render** (recommended, free tier)
```bash
git push origin main
# Create new Web Service on render.com
# Connect GitHub repo → Set env variables in dashboard
```

**Option 2: Railway**
```bash
npm install -g @railway/cli
railway login
railway up
```

### Frontend (Static Files)

Deploy to any static host:

```bash
# Cloudflare Pages
wrangler pages deploy .

# GitHub Pages
git push origin main
# Enable Pages in repo settings

# Vercel
vercel --prod
```

---

## Troubleshooting

### App won't install on Android
- ✅ Use Chrome, Samsung Internet, or Edge (not Firefox)
- ✅ Check HTTPS is enabled (for deployed version)
- ✅ Clear browser cache and try again

### Estimates failing with "Network unavailable"
- ✅ Check API_BASE URL in `index.html` matches your backend
- ✅ Verify GROQ_API_KEY is set in `.env`
- ✅ Check CORS headers in `server.js`

### Service Worker not updating
- ✅ Uninstall app and reinstall
- ✅ Chrome: `chrome://serviceworker-internals/` → Unregister
- ✅ Clear browser cache

---

## License

ISC — See LICENSE file

---

## Support

📧 Issues: [GitHub Issues](https://github.com/Punter613/skskprotech/issues)  
💬 Discussions: [GitHub Discussions](https://github.com/Punter613/skskprotech/discussions)

---

**Made with ❤️ for mobile mechanics everywhere**

v1.2.0 | Last Updated: June 2026
