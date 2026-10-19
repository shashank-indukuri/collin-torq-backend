# Project handoff — 2026-10-19

Read this file first on the next machine. This repository is a checkpoint of the entire source workspace, including unfinished work. **The backend is not yet beta complete.** The last instruction before preparing this transfer was to complete general guide/alternative discovery and integrate the experimental browser agent. That implementation was interrupted to publish this checkpoint at the user's request.

## Goal and product expectations

Build a reliable HVAC parts sourcing backend that Collin can connect to his existing mobile frontend. The two HTML screens are local test clients, not a replacement mobile product. The user wants goal-driven Stagehand browsing with Browser Use recovery on unexpected controls, rather than expanding supplier-specific selectors and text parsers. Use recorded evidence and explicit uncertainty; never manufacture stock, compatibility, currency, units or delivery dates to fill a comparison.

The user's current preferred model is OpenAI `gpt-6-luna` after local Qwen3.5 consistency failures. Ollama remains supported for local evaluation. Model changes alone do not change the supplier execution engine. The default engine remains `legacy`; `SUPPLIER_ENGINE=agent` opts into the experimental Stagehand goal agent. It is not screenshot-based computer use: the current model client accepts text only.

**Do not email or message Collin until the user explicitly confirms.** No message has been sent as part of this transfer. Do not place orders or add products to carts while testing.

## Documents and agreed flow

The original documents are committed at the repository root:

- `10_07_2026_ Torq Slim Back End User Flow.docx`
- `Run 3 Parts Availability Test 2026-10-01 v4.xlsx`

Reference Google Doc: https://docs.google.com/document/d/1yh8dg73yWgO82CpbxLlyAim-DT-GI0AvTkz2DpXsg-A/edit
Reference test sheet: https://docs.google.com/spreadsheets/d/1ljzefXSdfANe9KV6WPf8BRFhkAW9u2la/edit

The agreed workflow:

0. Accept origin coordinates/address; Arlington, VA 22201 is the selected test origin.
1. Accept equipment manufacturer/model and requested components. Exact manufacturer part numbers bypass guide discovery.
2. Find a saved verified guide, then manufacturer public resources, configured shop dealer portal, authenticated Johnstone model-to-part resources, Parts Town model resources, then open-web discovery. Confirm full model/ambiguities. Honest failure asks for an exact part number.
3. Identify requested components in the guide's applicable model column, retaining original PDF page/row/header evidence.
4. Explicitly capture selected manufacturer identifiers, descriptions and actual specifications. Unknown values stay unknown.
5. Search Johnstone, Parts Town and Grainger for exact identifiers. Handle sign-in automatically from private backend credentials. Only after completed exact scope and explicit user permission, discover replacement/comparable candidates using descriptions/specifications and query variations. Preserve replacement-source authority and installation limitations.
6. Compare lowest evidenced material cost, nearest branch with sufficient ready pickup stock, and earliest destination/quantity-specific shipping arrival. Resolve actual stocked branch addresses and coordinates before proximity ranking.
7. Select one option per part line, quote margin/labor, export text/CSV and optionally email. These downstream product capabilities have not been completed in this repository.

The detailed audits are `docs/validation/WORKFLOW_2_TO_6_AUDIT.md`, `docs/validation/SUPPLIER_COMPLETENESS_AUDIT.md` and `docs/validation/E2E_BRANCH_VALIDATION_2026-10-18.md`. Older milestone documents describe the behavior and limitations at their dates; they are not a current beta certification.

## Resume on a new machine

The tested environment was macOS, Node 22.22.3, Python 3.12.10, uv and installed Google Chrome. The current Python lock contains macOS-specific PyObjC packages; review platform dependencies before installing it on Linux/Windows. Paths and `.venv/bin/python` assumptions are currently Unix-oriented.

```sh
git clone https://github.com/shashank-indukuri/collin-torq-backend.git
cd collin-torq-backend
# Use Node 22.22.3, for example: nvm install && nvm use
npm ci
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.lock
cp .env.example .env
```

For the previously selected cloud model, edit the private `.env`:

```dotenv
MODEL_PROVIDER=openai
OPENAI_MODEL=gpt-6-luna
OPENAI_ENV_FILE=/absolute/path/to/your/private/.env.local
CLOUD_BUDGET_USD=0.50
SUPPLIER_ENGINE=legacy
```

The external private file must contain `OPENAI_API_KEY`. Alternatively provide that variable through the process environment. Obtain credentials securely from the user or a password manager. The original machine's external env file and secrets are intentionally not committed. Never put keys in browser HTML, prompts, jobs, logs or committed files.

For a local-only run, retain `MODEL_PROVIDER=ollama`, install/start Ollama, pull a chosen model and set `OLLAMA_MODEL` accordingly. Qwen3.5:latest was installed on the original machine but did not pass consistency checks. A model advertised by Ollama must actually have runnable weights; list output alone was misleading earlier. There is no automatic switch from Ollama to paid cloud inference.

Set `CHROME_PATH` to the actual Chrome executable on the new machine. Default macOS path is `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. The app creates its own profile in `.local/chrome`, CDP port 9322; it does not reuse personal Chrome. Only one process may own it. Browser tests must run serially, with the normal backend stopped when instructed by each script.

For automatic supplier sign-in:

```sh
mkdir -p .local
chmod 700 .local
cp examples/supplier-credentials.example.json .local/supplier-credentials.json
chmod 600 .local/supplier-credentials.json
# Edit the copied file privately with real credentials before testing live sign-in.
chmod 600 .env
```

The example is placeholders only. Johnstone's authorized test account store was Alexandria #461, offered near Arlington ZIP 22201. There was no Arlington-named option. Confirm store access for another account rather than selecting arbitrary stores. Sessions must be established again on the new machine. The credential reader rejects files accessible to other OS users; username/passwords are never sent to the model.

```sh
npm run typecheck
npm test
npm run doctor
npm run dev
```

Open http://127.0.0.1:4310/flow for guided testing and http://127.0.0.1:4310/ for diagnostics. API reference: http://127.0.0.1:4310/api/openapi.json. Health: http://127.0.0.1:4310/api/health. The `doctor` paid-services field is currently a static value and should not be used to infer the configured provider; use `/api/health` instead.

## Data intentionally not transferred through Git

`.env*` secrets, `.local`, `.venv`, `node_modules`, browser profiles/cookies, SQLite jobs, screenshots, detailed browser traces and local machine logs are excluded. Git contains the full application source, test scripts, dependency locks, original project documents, validation writeups and selected sanitized report JSONs under `reports/handoff-2026-10-19/`.

On a fresh machine, old job IDs in reports are historical references, not working result links. Create new jobs. The reviewed public York PDF is downloaded again and verified. Runtime data and original evidence remain on the old machine; there is no claim that the repository contains their screenshots or a portable database snapshot.

The app's cumulative estimated cloud usage ledger is `.local/cloud-usage.json`. A new clone has a new ledger, so the configured $0.50 is a per-install app budget, not an account-wide ceiling. If preserving the same cumulative allowance is required, securely transfer that ledger separately with owner-only permissions before model calls. Do not reset/delete an existing ledger to get around a cap. The original machine's paid key may serve other apps, outside this ledger.

## Validated baseline before the interrupted work

- Reviewed York guide resolution, prefix confirmation, exact model-column extraction, explicit capture, integrity checks and immutable capture/source lineage.
- Automatic Johnstone/Parts Town sign-in on `AUTH_REQUIRED`, one bounded retry per supplier per job. This wrapper now also covers documented alternative lookups; cancellation is checked before/after login.
- Legacy exact supplier lookup across all three providers, partial/error versus no-match distinction, saved evidence, documented capacitor replacement chain review and consent gating.
- Step 6 fresh comparison child jobs, conservative evidence gates, ZIP-origin approximation, geocoding/cache for known branch addresses, result expiry, refresh from original source.
- Guided HTML journey, model clarification, capture, sourcing, comparison, explicit alternatives consent, result deep links and restart persistence.
- The shared cloud model/budget integration and bounded Browser Use recovery were exercised with Luna. An actual permitted action must be verified; an LLM claiming success is insufficient.
- Latest full live journey passed processing but had `commercialComplete: false`. It returned exact board listings at all three suppliers, no exact listing for the historical capacitor, and reviewed replacement candidates. Cheapest and closest categories were incomplete. Do not confuse processing success with complete supplier/commercial coverage.

Test input: York `E1RD036` is a prefix, not a confirmed nameplate model. The explicit **test** suffix is `E1RD036S06B`. Historical guide: `035-21220-001`, Rev. E (0409), distributor mirror, 3 pages from a document numbered to 4. Board `S1-33101975102`, description `Control, Defrost`; capacitor `S1-02425893000`, `40/5 MFD`, voltage unknown. Supplier/OEM reference candidates `S1-02425893700` and `S1-CAP4405040DR` still require installation compatibility review; a chain containing supplier assertions is not complete OEM approval.

## Current unfinished changes saved in this checkpoint

The following files were added immediately before the transfer request. They **typecheck but have not received live acceptance or dedicated regression coverage**:

- `src/discovery.ts`: shared structured model calls, observed-link selection, bounded read-only public web search/page reads, and HTTPS PDF downloading with public-address DNS validation, pinned download address, redirect/size/time limits. Search starts at Bing. Search reliability, redirects, cookie state, and general web navigation need evaluation. Browser navigation is not a DNS-pinned HTTP fetch; review isolation and navigation guards before treating arbitrary web browsing as ready for beta.
- `src/general-guides.ts`: multi-document hash-backed cache, public PDF link discovery, manufacturer/model evidence checks, general guide metadata and cache revalidation. No configured dealer portal or authenticated Johnstone model-to-part adapter was implemented. Those branches must remain explicit. Public manufacturer/supplier query ordering and coverage still need work.
- `src/general-parts.ts`: model-extracted guide candidates with literal rows, header/cell evidence, cache reuse and explicit user confirmation. Independent table-column alignment validation needs adversarial tests; the present sequential-cell check alone is not enough to establish arbitrary PDF alignment.
- `src/general-alternatives.ts`: bounded replacement/description/specification searches and grounded candidate identities/reference claims. **This module is not wired into `reviewAlternatives` yet.** Its current placeholder capacitor object assigns `dual_run`/`round` when capacitance and voltage exist; remove these unsupported assumptions and redesign generic specifications before integration. Installed voltage and full physical/electrical compatibility must be checked explicitly.

Integration edits are already present in `src/guides.ts`, `src/parts.ts`, `src/capture.ts`, `src/worker.ts` and `src/server.ts`. Non-York guide requests now reach general discovery; general part extraction is asynchronous and capture revalidation uses it. Direct guide/extract/capture API operations share the browser exclusivity queue. The reviewed York path remains. One offline guide test now injects an empty general discovery result, avoiding live browsing/model calls inside the offline suite.

These changes must be reviewed and completed before advertising general guide support. They are preserved rather than discarded so the next machine can continue exactly where we stopped.

## Next work in priority order

1. Review the new discovery modules and add offline adversarial regressions: mismatched manufacturer, incidental model mentions, suffix ambiguity, missing PDF pages, corrupt cache, invented links/quotes/parts, shifted/omitted/duplicated model cells, SSRF/private-address/redirect/size/time boundaries and cancellation. Revalidate cached evidence without silently trusting mutable metadata.
2. Replace capacitor-only generic specification assumptions with component-appropriate evidence. Wire general alternative discovery into consented reviews, preserve documented York behavior, use the same automatic sign-in wrapper, expose reference failures honestly, and keep unapproved alternatives out of rankings.
3. Complete the experimental supplier agent before promoting it. Current `assembleAgentOffer` always sets shipping `quantityConfirmed: false`; arrival extraction only accepts literal ISO dates. This loses shipping coverage achieved by the legacy Grainger path. Implement evidenced requested quantity/destination/date handling, and collect actual stocked branch addresses through relevant location controls/pages. Do not fabricate USD, each, new condition or ready pickup.
4. Ensure account-only suppliers are actually authenticated where needed. A public no-match must not silently stand in for an authenticated completed search when the required scope differs.
5. Compare the legacy and experimental paths using the same real requests and evidence. Only after passing the commercial/coverage gates set `SUPPLIER_ENGINE=agent` as the default. Merely configuring Luna does not promote the agent.
6. Run multiple real equipment families, alternative success/refusal, unknown controls, local/cloud recovery, zero/insufficient stock, unknown currency/units, expired sessions, challenges, cancellation, retries/restarts, and stale/replayed requests. General dealer portals, unknown branch discovery and wider geocoding remain open work. No paid Geocodio fallback is configured.
7. Address local-only/single-operator limitations, account isolation, durable service operations and remaining user selection/export/quote features before shipping a hosted beta. The current Fastify service binds only to loopback.

## Validation commands and outcomes

For this transfer, `npm run typecheck` and `npm test` were rerun. **166/166 offline tests passed**. No live model/supplier acceptance was rerun for the newly added discovery modules. The test output is preserved under `reports/handoff-2026-10-19/offline-tests.txt`.

With the normal backend stopped, browser/model acceptance scripts include:

```sh
npm run acceptance:agent
npm run acceptance:workflow-agent
npm run acceptance:agent-live -- johnstone
npm run acceptance:flow-alternatives
npm run acceptance:guided-live -- --serve
```

The last command can leave its server running. Then `npm run acceptance:journey-negative` and `npm run acceptance:api-contract` validate that newly generated journey. Do not run browser scripts concurrently. Live calls may incur model charges and supplier pages can change. Review existing script prerequisites and data assumptions; some older acceptance scripts contain historical IDs or require manual interaction.

Prior checks included 18 live supplier checks in the guided journey, 11 request failure/replay cases, mutation tests for comparison and capture, real Browser Use unknown-control execution, positive and no-match agent fixtures, and one real Johnstone agent board check. They do not validate today's new general-discovery code.

For local model reevaluation, `npm run test:local-model -- qwen3.5:latest` forces Ollama and zero cloud budget, runs structured/tool-use cases plus browser paths, and must not silently use cloud inference. Inspect `docs/validation/LOCAL_MODEL_VALIDATION.md` and `docs/validation/LUNA_VALIDATION.md` before interpreting a single passing run as consistency.

## Suggested prompt for the next coding session

> Read HANDOFF.md, the two original project documents and docs/validation/WORKFLOW_2_TO_6_AUDIT.md. Continue the interrupted general guide/alternative discovery and experimental Stagehand/Browser Use agent implementation. Review and test the new discovery modules before wiring generic alternatives. Preserve source evidence, explicit consent, account authentication, cancellation, capture integrity and comparison gates. Use GPT-6 Luna with the provided private server-side key; keep Ollama testing available. Do not email Collin, order parts, or claim beta readiness until real commercial coverage and end-to-end acceptance pass. The current engine default is legacy; completing and validating the agent is unfinished work.
