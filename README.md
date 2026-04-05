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

**Without a Gemini key, chat uses mock planners** — replies look repetitive and **are not** the real model. Each machine needs its own env file.

1. Copy the template: **`cp backend/.env.example backend/.env`**
2. Add **`GEMINI_API_KEY=`** from [Google AI Studio](https://aistudio.google.com/apikey) (one key per person, or **one shared team key** in a private Slack/Discord — **never commit it**).
3. From the repo root: **`npm run dev`**
4. Confirm the API terminal prints **`Gemini: enabled (GEMINI_API_KEY loaded)`**, or open **`http://localhost:3001/api/journey/gemini-status`** — you want **`"configured": true`**.

The server loads **`backend/.env`** even when you run `npm run dev` from the repo root (a **`.env`** at the repo root also works). **Do not commit `backend/.env`.** After the event, rotate the key if it was pasted in a public channel.

**Optional:** [Browser Use Cloud](https://cloud.browser-use.com/settings) — set **`BROWSER_USE_API_KEY`** in the same file (see `backend/.env.example`).

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
