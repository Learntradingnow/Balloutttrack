# Balloutt Trades — Ledger

A single dashboard for trade logs, income/expenses (trading / business / personal),
goals, daily habits, a personal + business journal, and a Smart AI assistant that
reads your real logged data. Everything is editable straight from the website — no
code edits needed after it's deployed.

## What's inside
- `server.js` — Express API (CRUD for trades, income, goals, journal, habits + a
  summary endpoint + the Smart AI chat endpoint)
- `db.js` — tiny JSON-file datastore (no external database needed)
- `public/` — the frontend (plain HTML/CSS/JS, no build step)

## Smart AI assistant
The "🧠 Smart AI" tab is a real AI chat, not scripted replies — it's given your
actual trades, income, goals, and habits as context on every message, and is
explicitly instructed not to invent market prices or make specific buy/sell calls
since it has no live market data.

To turn it on, set **one** of these as a Railway environment variable:
- `ANTHROPIC_API_KEY` — uses Claude (`claude-haiku-4-5-20251001` by default; override
  with `CLAUDE_MODEL`)
- `DEEPSEEK_API_KEY` — uses DeepSeek (`deepseek-chat` by default; override with
  `DEEPSEEK_MODEL`)

If both happen to be set, set `AI_PROVIDER=anthropic` or `AI_PROVIDER=deepseek` to
pick which one is used. Without either key, the chat tab still works but says it
isn't connected yet.

## Run it locally
```bash
npm install
npm start
```
Then open http://localhost:3000

Data is stored in `./data/db.json` locally. Delete that file to reset everything.

## Deploy on Railway (with GitHub)

1. **Push this folder to a new GitHub repo:**
   ```bash
   git init
   git add .
   git commit -m "Initial ledger app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```

2. **On Railway:**
   - New Project → "Deploy from GitHub repo" → pick the repo.
   - Railway auto-detects Node via Nixpacks and runs `npm install` then `npm start`. No config needed.

3. **Make your data persistent (important):**
   Railway's filesystem resets on every redeploy. To keep your trades/goals/journal
   across deploys, attach a **Volume**:
   - In your Railway service → **Settings → Volumes → New Volume**
   - Mount path: `/data`
   - That's it — `db.js` automatically uses `/data/db.json` when `/data` exists.
   Without a volume, the app still works, but data resets on redeploy.

4. **(Optional) Lock it with an access code:**
   - In Railway → your service → **Variables** → add `ACCESS_CODE=whatever-you-want`
   - On the site, enter that same code in the "Access code" box in the sidebar before
     adding/editing data. Leave the variable unset to keep it open (fine if only you
     use the link).

5. Railway gives you a public URL (or attach your own domain under **Settings → Networking**).

## Editing content
Everything — trades, income entries, goals, habits, personal notes, business notes —
is added, edited, and deleted directly from the web UI. Nothing requires touching
code or GitHub after the initial deploy.

## Extending it
- Add more fields: edit the relevant `<form>` in `public/index.html` and matching
  `<table>`/render function in `public/app.js` — the backend already accepts arbitrary
  JSON bodies per collection, so new fields just flow through.
- Swap storage: if you outgrow the JSON file, point `db.js` at Postgres (Railway offers
  a one-click Postgres plugin) — the rest of the app doesn't need to change, just the
  read/write functions in `db.js`.
