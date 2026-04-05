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

### Hackathon / team quickstart (Gemini)

**Why this matters:** The API key **never lives in Git** (it would be public and unsafe). So when someone clones the repo, they only get **`.env.example`** (no secret). Until they add a real key locally, the backend uses **built-in mock planners** — fixed rules, similar answers for everyone — **not** Google Gemini. That is why teammates “see the same custom answer” until they configure `.env`.

**What the steps do:**

1. **`cp backend/.env.example backend/.env`** — Creates a **local** file Git ignores. Your key stays on your laptop only.
2. **`GEMINI_API_KEY=...`** — Paste the key from [Google AI Studio](https://aistudio.google.com/apikey). Use **one key per person**, or for a hackathon share **one team key** in a **private** chat (Slack/Discord DM). **Never commit `backend/.env`.** If a key was ever posted publicly, create a new key in AI Studio and delete the old one.
3. **`npm run dev`** — Starts Vite (UI) and the Express API. The API reads **`backend/.env`** on startup (it also looks for a **`.env`** at the **repo root** if you prefer one file for the whole project).
4. **Check that Gemini is on** — In the terminal where the API runs, you should see **`Gemini: enabled (GEMINI_API_KEY loaded)`**. Or in a browser: **`http://localhost:3001/api/journey/gemini-status`** should return **`{"configured":true}`**. If it says **`configured: false`**, the key is missing, empty, or the server didn’t see the file — **restart** `npm run dev` after editing `.env`. Also ensure the backend is actually running on **port 3001** (otherwise the UI can’t reach the API).

**In the app:** With Gemini enabled, Live actions should show **`gemini`** (not **`mock`**) after you send a message. The chat subtitle also reflects whether the server sees a key.

**Optional — Browser Use Cloud:** For automated browser sessions from the Live actions panel, add **`BROWSER_USE_API_KEY`** from [Browser Use Cloud settings](https://cloud.browser-use.com/settings) in the same **`backend/.env`** file (see `backend/.env.example`).

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
