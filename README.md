# SKSK ProTech - Rebuild scaffold

This branch contains a clean scaffold for the SKSK Intelligence platform (backend + lightweight PWA).

Please review the code and environment variables before deploying to Render.

Required environment variables (example keys set in Render):

- SUPABASE_URL
- SUPABASE_KEY (or SERVICE_ROLE)
- GROQ_API_KEY (if using Groq)
- STRIPE_SECRET_KEY (if you enable payments)
- STRIPE_WEBHOOK_SECRET (if you enable webhooks)

Deploy notes:
- Backend entrypoint: `api/server.js`
- Start command: `npm start`
- Build script for Render: `./render-build.sh`

