# CarePilot

Monorepo layout so the team can branch around **frontend** and **backend** separately:

| Folder       | Role                                                         |
| ------------ | ------------------------------------------------------------ |
| `frontend/`  | Vite + React + TypeScript (CarePilot UI)                     |
| `backend/`   | Node + Express API (Gemini assist + Browser Use Cloud proxy)   |

## Product story: we don’t just suggest—we execute

CarePilot is built around a **suggest → execute** loop:

1. **Chat** — The assistant reasons about nutrition and next steps (powered by **Google Gemini** when `GEMINI_API_KEY` is set).
2. **Plan** — Replies include structured **steps and links** (browser session) you can act on.
3. **Execute** — In **Chat → Live actions**, select steps and tap **Run selected** so **Browser Use Cloud** runs a real browser task (prices, public resources, etc.). Results stream back into the chat.

Judges and users should see: advice is not the end state—**execution in the browser** is.

### Demo script (~3 minutes)

1. **Health input** or **Quick check** — show personalization.
2. **Chat** — Ask one concrete question (e.g. foods for sleep and recovery).
3. Point to the **banner**: “Suggest → execute” + **Google Gemini** attribution.
4. When the assistant returns a browser plan, open **Live actions**, check steps, **Run selected** (requires `BROWSER_USE_API_KEY`).
5. Show the **result** in the chat thread—close the loop out loud: *“That’s not a PDF—it’s a run.”*

### Sponsor tracks (MLH / Gemini)

- **Google Gemini API**: Journey assist and nutrition flows call Gemini via the backend; the UI links to [Gemini API](https://ai.google.dev/gemini-api) on the chat page and in the sidebar.
- **Best Interactive AI**: Multi-turn chat, structured plans, and the **Run selected** path make the interaction visible—not a black box.

## Setup

From the **repo root**:

```bash
npm install
```

npm workspaces install dependencies for both packages (hoisted under the root `node_modules` when possible).

### Backend environment (optional)

Copy `backend/.env.example` to **`backend/.env`** and set:

- **`GEMINI_API_KEY`** — [Google AI Studio](https://aistudio.google.com/apikey). Without it, chat uses mock planners (`mock` in Live actions).
- **`BROWSER_USE_API_KEY`** (optional) — [Browser Use Cloud → Settings → API keys](https://cloud.browser-use.com/settings). Powers **Live actions** / grocery automation via the [REST v2 tasks API](https://docs.browser-use.com/cloud/api-v2-overview) (`/api/v2/tasks`). Alias: **`BROWSER_USE_CLOUD_API_KEY`**. Optional tuning: **`BROWSER_USE_LLM`**, **`BROWSER_USE_FLASH_MODE`** — see `backend/.env.example`.

The server loads **`backend/.env`** when you run from the repo root (or a **`.env`** at the repo root). **`GET /api/health`** returns **`geminiConfigured`** and **`browserUseConfigured`** booleans (never the secrets). After editing `.env`, restart `npm run dev`.

## Dev

Run UI and API together:

```bash
npm run dev
```

- Frontend: http://localhost:5173  
- Backend: http://localhost:3001 — e.g. `GET http://localhost:3001/api/health`

Run only one side:

```bash
npm run dev:web
npm run dev:api
```

## Build

There is **no** root `npm run build` script — it made Railway’s **backend** service run the **frontend** Vite build by mistake. Build the UI workspace explicitly:

```bash
npm run build:web
```

Output: `frontend/dist/`.

## Deployment (API keys optional)

The backend can serve the built SPA from `frontend/dist` when `index.html` is present (same origin as `/api`). **Gemini, Maps, and Browser Use are optional** — without keys the app uses mock planners and offline flows.

### Docker

From the repo root (requires Docker). The image uses **workspace-scoped** `npm ci` so the build fits in small RAM limits (avoids exit 137 OOM):

**Split images** (recommended — matches Railway frontend vs backend):

```bash
docker build -f Dockerfile.frontend -t carepilot-ui .
docker run --rm -p 3000:3000 -e PORT=3000 carepilot-ui

docker build -f Dockerfile.backend -t carepilot-api .
docker run --rm -p 3001:3001 -e PORT=3001 carepilot-api
```

On **Railway**, open **each service → Settings → Build** and set **Dockerfile path** explicitly:

| Service | Dockerfile path |
|---------|------------------|
| **carepilot-frontend** | `Dockerfile.frontend` |
| **carepilot-backend** | `Dockerfile.backend` |

If Railway says **“Using Detected Dockerfile”** and the log shows a **multi-stage** build with `COPY --from=build` and plain `RUN npm ci --omit=dev` (no `--workspace=`), you are **not** using `Dockerfile.backend` — the build will fail on **Alpine** (Python / **canvas** / node-gyp). **Clear the custom Dockerfile** or point it to the table above, then redeploy.

`Dockerfile.backend` uses **Debian bookworm-slim** and installs **Python**, **Cairo**, **Pango**, etc., so `canvas` can compile.

Open http://localhost:3001 — UI + `/api` on one port.

**Public URL:** set `CORS_ORIGINS` to your site origin (comma-separated), e.g. `-e CORS_ORIGINS=https://myapp.fly.dev`. For same-origin (this Docker pattern) you often only need CORS when the browser origin differs from the API.

**Custom static path:** `STATIC_DIST=/path/to/dist` (defaults to `frontend/dist` relative to the repo layout).

**Disable SPA:** `SERVE_SPA=0` to serve API only (use a reverse proxy for static files).

### Railway

**Option A — one service (simplest):** One Railway service from this repo: **build** `npm ci && npm run build:web`, **start** `npm start`. The server serves the SPA and `/api` on the same URL; no extra env for API routing.

**Option B — separate frontend + backend services:** Use the **repo root** as the working directory for both services. If **`npm ci` runs out of memory (exit 137)** on Railway, use **scoped installs** so each service skips the other workspace’s heavy deps:

| Service | Build command | Start command |
|--------|----------------|---------------|
| **Backend** | `npm ci --workspace=carepilot-backend --no-audit --no-fund` | `npm start` |
| **Frontend** | `npm ci --workspace=carepilot-frontend --no-audit --no-fund && npm run build -w carepilot-frontend` | **`npm run start:frontend`** (runs `vite preview` on **`0.0.0.0:$PORT`**) |

The repo includes **`railway.toml`** so Railway uses **Nixpacks** instead of **Docker** by default (Dockerfile was causing OOM during full `npm ci`). Override the **Build command** in the dashboard with the rows above if the default install still fails.

**Vite “Node 20.19+” / `CustomEvent is not defined`:** Railpack must use Node **20.19+** (this repo targets **22** via **`engines`**, **`.nvmrc`**, and **`nixpacks.toml`**). If logs still show **Node 18**, add a service variable **`NODE_VERSION`** = **`22`** (or **`NIXPACKS_NODE_VERSION`** = **`22`**).

**Backend running `vite build`:** Do not use a root **`npm run build`** for the backend — the root no longer defines **`build`** so Railpack won’t compile the frontend on the API service. Backend **build command** should stay install-only, e.g. `npm ci --workspace=carepilot-backend --no-audit --no-fund`.

If the **frontend** service used **`npm start` at the repo root**, it would start the **backend**, not the UI — and the UI service would look “dead”. The frontend **must** use **`npm run start:frontend`** (or `npm run start -w frontend`) after a successful build.

**Deploy logs show `vite` on `localhost:5173`:** That is **dev** mode (`npm run dev`). Railway sends traffic to **`$PORT`** (often **8080**), so the app must listen on **`0.0.0.0:$PORT`**. Prefer **production**: **Start** = **`npm run start:frontend`**, which runs **`frontend/scripts/railway-static.mjs`** (Node-only static server for **`dist/`**). **`vite preview` is not used in production** — Vite is a **devDependency** and may be missing after `npm ci --omit=dev`, which shows up as **HTTP 502** in **HTTP Logs** with nothing obvious in Deploy logs.

**HTTP Logs show 502 on `GET /`:** Usually the container is not serving **`dist`** (build missing) or the start command crashed. Confirm **Build** runs **`npm run build:web`** (or equivalent) and **Start** is **`npm run start:frontend`**, then check **Deploy logs** for `carepilot-frontend static` and `Missing frontend/dist` if the build never ran.

Set on the **frontend** service (build-time / Vite):

- `VITE_API_BASE_URL` = your backend public URL, e.g. `https://carepilot-backend-production.up.railway.app` (no trailing slash). Redeploy the frontend after setting.

On the **backend** service, set **`CORS_ORIGINS`** to your **frontend** public URL (comma-separated if several), e.g. `https://carepilot-frontend-production.up.railway.app`, so the browser may call the API cross-origin.

Then open the **frontend** URL in the browser, log in, and use Chat — confirm **`/api/health`** on the backend URL returns JSON.

**CLI (optional):** with [Railway CLI](https://docs.railway.com/develop/cli) installed and `railway login` + `railway link` from the repo root, run `FRONTEND_URL='https://…'` `./scripts/railway-set-cross-origin-env.sh` (see script comments).

**“Application failed to respond”** (Railway edge + Request ID): **Deploy logs** can look healthy while the browser URL fails — often you’re hitting the **frontend** hostname but reading **backend** logs (or the opposite). Note the **exact host** in the address bar. Test **`https://YOUR-BACKEND-HOST/api/health`**; JSON means the API is up. Use **HTTP Logs** on the service that matches the failing URL. In **Settings → Deploy**, point the **health check** at **`/api/health`** or **`/`** (API-only images return **200** JSON on **`/`** when there is no SPA). Common causes: wrong **start** command, crash on boot, or nothing on **`PORT`**. Frontend: **`npm run start:frontend`** + successful **build**. Backend: listens on **`0.0.0.0:$PORT`**.

### Other hosts (Render, Fly, etc.)

1. Build command: `npm ci && npm run build:web`  
2. Start command: `npm start` (runs the backend workspace `start` script)  
3. Railway and most platforms set `PORT` automatically.  
4. Optional AI/maps keys when ready: `GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `BROWSER_USE_API_KEY`, etc.

## Branching

Typical split: feature branches that touch only `frontend/` or only `backend/` merge cleanly when APIs are agreed (paths under `/api/...`, JSON shapes). Keep shared contract notes in PR descriptions or a short doc when you add real endpoints.
