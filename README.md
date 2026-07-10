# StadiumMind AI — Smart Stadium Operations Copilot
### FIFA World Cup 2026 · PromptWars Challenge 4

A working, deployable stadium-operations dashboard with a real Gemini-powered
AI copilot, live (simulated) crowd data, and eight functional AI modules for
fans, organizers, volunteers, and emergency responders.

---

## ⚠️ Before you do anything else

If you pasted an API key into a chat, an issue tracker, or anywhere public —
**revoke it and generate a new one** at
https://aistudio.google.com/app/apikey. This project never hardcodes a key
anywhere; it only reads `GEMINI_API_KEY` from your local `.env` file, which is
git-ignored.

---

## 1. What's actually real here (and what isn't)

**Real:**
- Every AI response (chatbot, incident guidance, volunteer answers, analytics
  explanations, PDF executive summaries) is a live call to the Gemini API,
  grounded in a JSON snapshot of current stadium state that's injected into
  every prompt. If the model can't answer from that data, it's instructed to
  say so explicitly instead of guessing.
- Crowd occupancy, queue length, and inflow are produced by a bounded,
  mean-reverting random-walk simulation that follows a real match-day arc
  (gates opening → build-up → kickoff plateau → taper). It updates every 5
  seconds and keeps rolling history so the congestion forecast is a genuine
  linear regression over that history, not a fabricated number.
- Navigation routing, nearest-facility lookup, and incident-team dispatch use
  real Euclidean-distance geometry over the seat/gate/facility map in
  `backend/data/stadiumData.json`.
- Incident severity/priority/team assignment is rule-based and deterministic
  (never left to the LLM) — the AI only writes the human-readable guidance
  text on top of that decision, so safety classification can't drift.
- PDF reports are generated live with `pdfkit` from whatever the current
  simulated state is when you click "Download."

**Simplified (be upfront about this in a demo/judging context):**
- There's no database — state lives in the Node process's memory and resets
  on restart. Swapping in Postgres/Mongo would mean replacing
  `simulationService.js`'s in-memory object with real queries; the route
  layer wouldn't need to change.
- There's no user auth/accounts — this is a single shared operations view.
- Crowd data is a realistic simulation, not a live camera/turnstile feed,
  since we don't have real World Cup sensor access. The regression and
  routing logic that consumes it is genuine, though — point it at a real
  feed and it works unchanged.

---

## 2. Folder structure

```
stadiummind-ai/
├── backend/
│   ├── server.js                 Express app entrypoint
│   ├── package.json
│   ├── .env.example
│   ├── data/stadiumData.json     Seat map, gates, facilities, response teams
│   ├── services/
│   │   ├── geminiService.js      All Gemini calls + grounding rules
│   │   └── simulationService.js Live crowd simulation + regression forecast
│   ├── routes/
│   │   ├── chat.js               Copilot (SSE streaming + session memory)
│   │   ├── navigation.js         Gate/route/facility recommendations
│   │   ├── crowd.js              Live density + congestion prediction
│   │   ├── accessibility.js      Accessible facility finder
│   │   ├── sustainability.js     Carbon footprint calculator
│   │   ├── incidents.js          Incident reporting + dispatch
│   │   ├── volunteers.js         Volunteer task copilot
│   │   ├── analytics.js          Aggregated metrics + AI explanation
│   │   └── reports.js            PDF report generator
│   └── utils/
│       ├── validators.js
│       └── rateLimiter.js
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/{app.js, chat.js}
├── deployment/
│   ├── vercel.json
│   ├── render.yaml
│   ├── railway.json
│   └── Procfile
├── netlify.toml
└── README.md   (this file)
```

---

## 3. Local setup

**Requirements:** Node.js 18+.

```bash
cd backend
npm install
cp .env.example .env
# open .env and paste your OWN Gemini API key into GEMINI_API_KEY
npm start
```

Open `http://localhost:5000` — Express serves the frontend and API from the
same origin, so there's nothing else to run.

Without a key set, the dashboard still works fully for navigation, crowd,
accessibility, sustainability, and reports (their core logic doesn't need
Gemini) — only the chatbot, incident AI-guidance, volunteer copilot, and
analytics explanation will return a clear "AI service is not configured"
message instead of failing silently.

---

## 4. Environment variables

| Variable         | Required | Description                                      |
|-------------------|----------|--------------------------------------------------|
| `GEMINI_API_KEY`  | Yes (for AI features) | Your Gemini API key. Never commit this. |
| `GEMINI_MODEL`    | No       | Defaults to `gemini-2.5-flash`.                   |
| `PORT`            | No       | Defaults to `5000`.                               |

---

## 5. Deployment

### Render / Railway (recommended — single service, backend serves frontend)
1. Push this repo to GitHub.
2. Render: create a new Web Service, point it at `deployment/render.yaml`
   (or set root directory to `backend`, build `npm install`, start
   `npm start`). Railway: `deployment/railway.json` does the same.
3. Set `GEMINI_API_KEY` in the service's environment variable settings —
   never in the repo.

### Vercel
`deployment/vercel.json` routes all traffic to `backend/server.js` as a
serverless function. Set `GEMINI_API_KEY` in Project Settings → Environment
Variables (the `@gemini_api_key` reference in the config maps to that).
Note: the SSE streaming chat endpoint may behave differently under a
serverless cold-start model than on a long-running Render/Railway dyno —
Render/Railway is the better fit for the streaming copilot.

### Netlify (frontend only)
Netlify can't run the Express backend or hold your API key. Deploy the
backend to Render/Railway/Vercel first, then edit the `to` URL in
`netlify.toml` to point at that backend's `/api/*` before deploying the
`frontend/` folder to Netlify.

---

## 6. Testing instructions

Manual smoke test checklist:

1. `GET /api/health` → `{ status: "ok", aiConfigured: true/false }`
2. Open the dashboard → Stadium Pulse should populate within ~2 seconds and
   update every 6 seconds without a page reload.
3. Navigation → enter a real section number from
   `backend/data/stadiumData.json` (e.g. `114`) → should return a gate,
   distance, and nearby facilities.
4. Navigation → enter an invalid section (e.g. `999`) → should return a 404
   with a clear message, not a crash.
5. Crowd Intelligence → pick a zone → Predict → after the simulation has
   been running a few minutes you should see a real projected trend; in the
   first ~20 seconds it will honestly say it doesn't have enough history yet.
6. Incident Reporting → submit a "fire" incident → should show `critical`
   severity, a dispatched fire unit, and AI-written action steps (or a clear
   "GEMINI_API_KEY missing" message if not configured).
7. Report Generator → click any report → a PDF should download with live
   data and an AI executive summary section.
8. Copilot → ask "what's the crowd like in zone C right now?" → answer
   should match the live numbers shown on the Crowd Intelligence tab, not a
   generic answer. Ask something outside the provided data (e.g. "who won
   the 2018 World Cup?") → it should say it doesn't have enough information
   to answer that accurately, per its grounding rules.
9. Toggle dark/light mode — should persist on reload.
10. Resize to a mobile width — sidebar collapses to icon-only, chat widget
    stays usable.

---

## 7. Security notes

- The Gemini API key is only ever read server-side via
  `process.env.GEMINI_API_KEY`; it is never sent to the frontend.
- All AI-calling routes (`/api/chat`, `/api/incidents`, `/api/volunteers`)
  are behind a stricter in-memory rate limiter (20 req/min/IP) than the
  general API (120 req/min/IP).
- All request bodies are validated in `utils/validators.js` before touching
  any service.
- CORS is currently open (`cors()` with defaults) for ease of local testing —
  lock this down to your deployed frontend origin before going to production.
