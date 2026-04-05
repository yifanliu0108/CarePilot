# CarePilot

Monorepo layout so the team can branch around **frontend** and **backend** separately:

| Folder       | Role                                                         |
| ------------ | ------------------------------------------------------------ |
| `frontend/`  | Vite + React + TypeScript (CarePilot UI)                     |
| `backend/`   | Node + Express API (Gemini assist + Browser Use Cloud proxy)   |

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

```bash
npm run build
```

Output: `frontend/dist/`.

## Branching

Typical split: feature branches that touch only `frontend/` or only `backend/` merge cleanly when APIs are agreed (paths under `/api/...`, JSON shapes). Keep shared contract notes in PR descriptions or a short doc when you add real endpoints.
