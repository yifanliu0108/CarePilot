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

```bash
npm run build
```

Output: `frontend/dist/`.

## Branching

Typical split: feature branches that touch only `frontend/` or only `backend/` merge cleanly when APIs are agreed (paths under `/api/...`, JSON shapes). Keep shared contract notes in PR descriptions or a short doc when you add real endpoints.
