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

Copy `backend/.env.example` to **`backend/.env`** and set `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/apikey). The server loads **`backend/.env`** even when you run `npm run dev` from the repo root (you can alternatively use a `.env` at the repo root). Without a key, `POST /api/journey/assist` uses the built-in mock planner (`mock` in Live actions). For Browser Use Cloud, set `BROWSER_USE_API_KEY` (see `backend/.env.example`).

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
