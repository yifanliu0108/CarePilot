/**
 * Railway often auto-selects `npm run dev` for Vite apps — wrong in production.
 * `predev` runs before `vite`; we fail fast with an explicit fix when on Railway.
 */
const onRailway =
  Boolean(process.env.RAILWAY_ENVIRONMENT) ||
  Boolean(process.env.RAILWAY_PROJECT_ID) ||
  Boolean(process.env.RAILWAY_SERVICE_ID);

if (onRailway) {
  console.error(`
[CarePilot] The frontend service is running "npm run dev" on Railway — that will not work.

Fix: Railway → carepilot-frontend → Settings → Deploy → Custom Start Command:

  npm run start:frontend

Use the repo root as the service root (monorepo). Build command must include a production build, e.g.:

  npm ci --workspace=carepilot-frontend --no-audit --no-fund && npm run build:web

Then redeploy.
`);
  process.exit(1);
}
