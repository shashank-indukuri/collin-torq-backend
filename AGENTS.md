# Instructions for coding agents

These instructions are for Codex, Claude Code and similar agents. They cover
setting up this repo, starting the local server, and walking the user through
a beta test. For history and design context, read `HANDOFF.md`. For sample
inputs and expected results, read `docs/BETA_TESTING.md`.

## What this is

Torq is a local backend for sourcing HVAC parts. Given an equipment model, it
finds the manufacturer's parts guide and reads part numbers from it. Given
exact part numbers, it searches Johnstone Supply and Parts Town for price,
stock and stores. The beta is a **local demo**: one operator, the agent
engine, Johnstone and Parts Town. Grainger is out of scope because its bot
check blocks automated browsing.

## 1. Clone and install

Requires macOS, Node 22.18+, Python 3.12, `uv`, and Google Chrome.

```bash
git clone https://github.com/shashank-indukuri/collin-torq-backend.git
cd collin-torq-backend
git checkout feat/phase2-agent-complete   # until it is merged to main
npm ci
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.lock
```

If `npm ci` fails because a private registry in `~/.npmrc` is unreachable,
run `npm ci --registry=https://registry.npmjs.org`.

## 2. Secrets (the user provides them; you never create or print them)

The server needs three files that are never committed:

- `.env`: copy `.env.example`, then set `MODEL_PROVIDER=openai`,
  `SUPPLIER_ENGINE=agent`, `CLOUD_BUDGET_USD` (the code caps it at 3.00) and
  `OPENAI_ENV_FILE=<absolute path to .local/openai.env>`.
- `.local/openai.env`: contains only `OPENAI_API_KEY=...`.
- `.local/supplier-credentials.json`: Johnstone and Parts Town logins, in the
  shape of `examples/supplier-credentials.example.json`.

If the user gives you a backup zip, read its `RESTORE.txt` first and follow
it. Extract without overwriting, and never overwrite or delete an existing
`.local/cloud-usage.json`: that file is the spending ledger. Do not print the
contents of any of these files. List key names only.

Then lock the permissions down and check the setup:

```bash
chmod 700 .local && chmod 600 .env .local/openai.env .local/supplier-credentials.json
npm run doctor
```

## 3. Verify, then start

```bash
npm run check                    # typecheck, lint, format check, all offline tests
SUPPLIER_ENGINE=agent npm start  # listens on 127.0.0.1:4310 only
```

Open http://127.0.0.1:4310/flow for the guided UI. Spend so far:
`curl -s http://127.0.0.1:4310/api/health`.

Rules while the server runs:
- Run only one server or acceptance script at a time. They share one Chrome
  profile (`.local/chrome`) and CDP port.
- A separate Chrome window opens and browses the supplier sites during
  checks. That is the backend's browser. Tell the user to leave it alone until
  the check finishes.
- Keep the server on loopback. Do not change the bind address or expose the
  port.

## 4. Guide the user through a test

Each supplier check takes 1-2 minutes and costs about $0.01. Suggest these in
order.

**A. Exact part numbers.** This is the most reliable path and works for any brand.

```bash
curl -s -X POST http://127.0.0.1:4310/api/searches \
  -H 'content-type: application/json' \
  -d '{"mode":"live","stopAfter":"comparison",
       "origin":{"address":"2100 Clarendon Blvd, Arlington, VA 22201"},
       "suppliers":["partstown","johnstone"],
       "lines":[{"name":"filter drier","manufacturer":"Trane","partNumber":"DHY01481","quantity":1}]}'
```

Have the user open `http://127.0.0.1:4310/flow?job=<id>` with the returned
`id`. The expected prices for 9 real parts are in `docs/BETA_TESTING.md`.

**B. Guided model flow, York.** On `/flow`: model `York - E1RD036`, parts
"control board" and "capacitor". The board should come back near $196.72 at
Johnstone and $198.49 at Parts Town, with 3 Johnstone stores listed.

**C. Guided model flow beyond York.** Step 2 guide discovery:
- `Mitsubishi` / `MXZ-5D36NL-U1` finds Mitsubishi catalog OBB962A and asks the
  user to confirm the model. Steps 3-5 have not been run live on this catalog
  yet, so treat the result as exploratory.
- `Trane` / `SCWFN8042` and `Carrier` / `38AH-054` should stop with "supply
  the part number". That is correct: these brands keep parts lists behind
  dealer portals.

What to check in every result:
- Each price matches the supplier's own page for that exact part.
- Parts a supplier doesn't carry show "Not found", never a similar part.
- Stores with stock show name, count, address and phone.
- After 15 minutes, prices are hidden behind a "refresh" warning.

Automated live regression (9 parts, about $0.20):
`npm run regression:live -- --base http://127.0.0.1:4310`. Results are
written to `reports/regression-*.json`.

## Known limits (tell the user up front)

- "Earliest delivery" is always empty, because neither supplier prints a
  delivery date for a ZIP.
- Only Johnstone gives store distances, using `data/johnstone-stores.json`.
- Step 2 guide discovery works for York E1RD and for brands that publish
  catalogs. Dealer-portal doors (2-4) are not built.
- Johnstone may need a fresh sign-in after a cold start. The first live run
  signs in automatically from `.local/supplier-credentials.json`.

## Hard rules

- Never bypass a site's bot check or CAPTCHA (DataDome, slide-to-verify,
  press-and-hold). The agent stops with `SITE_CHALLENGE`. A person may clear
  the check by hand in the backend's Chrome window.
- Do not raise `CLOUD_BUDGET_USD` or the cap in `src/config.ts` without the
  user's approval. Never reset the usage ledger to get around the cap.
- Never commit `.env`, `.local/`, `.venv/` or anything under `reports/` that
  holds account data.
- After changing code, run `npm run check` before committing. Use Conventional
  Commits (`feat(agent): ...`, `fix(guides): ...`).
