#!/usr/bin/env bash
# Set VITE_API_BASE_URL on the frontend service and CORS_ORIGINS on the backend.
#
# Prerequisites:
#   1. Install CLI: https://docs.railway.com/develop/cli — e.g. `brew install railway` or npm i -g @railway/cli
#   2. From the repo root: `railway login` then `railway link` (pick project fortunate-vibrancy / production)
#
# Usage (replace with YOUR frontend public URL from Railway → carepilot-frontend → Networking):
#   export FRONTEND_URL='https://carepilot-frontend-production-xxxx.up.railway.app'
#   ./scripts/railway-set-cross-origin-env.sh
#
# Or one line:
#   FRONTEND_URL='https://YOUR-FRONTEND.up.railway.app' ./scripts/railway-set-cross-origin-env.sh

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-https://carepilot-backend-production.up.railway.app}"
FRONTEND_URL="${FRONTEND_URL:?Error: set FRONTEND_URL to your carepilot-frontend public https URL (no trailing slash)}"

if ! command -v railway >/dev/null 2>&1; then
  echo "Install the Railway CLI first: https://docs.railway.com/develop/cli"
  exit 1
fi

echo "Setting VITE_API_BASE_URL on carepilot-frontend → $BACKEND_URL"
railway variable set "VITE_API_BASE_URL=$BACKEND_URL" --service carepilot-frontend

echo "Setting CORS_ORIGINS on carepilot-backend → $FRONTEND_URL"
railway variable set "CORS_ORIGINS=$FRONTEND_URL" --service carepilot-backend

echo "Done. Trigger a redeploy of carepilot-frontend so Vite rebuilds with VITE_API_BASE_URL (Deployments → Redeploy)."
