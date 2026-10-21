# Torq local sourcing backend

**Resuming on another machine? Start with [HANDOFF.md](HANDOFF.md).** It records setup, current validation, missing beta capabilities, and the unfinished general-discovery changes in this checkpoint.

Local Stagehand 4.2.1 + Browser Use 0.13.11 + Chrome, with Ollama or explicitly configured OpenAI GPT-6 Luna. Chrome stays local. Live supplier websites require internet access; the OpenAI option also sends page text to the model API and incurs usage charges.

## Optional cloud agent evaluation

Set `MODEL_PROVIDER=openai`, `OPENAI_MODEL=gpt-6-luna`, and `OPENAI_ENV_FILE` to an absolute path containing `OPENAI_API_KEY` (or provide that variable directly). The backend reads only that key from the external file. Never put it in frontend code. `CLOUD_BUDGET_USD` limits this app's cumulative estimated reserved/spent usage, with a maximum of $3.00. It does not cap other applications sharing the key. Unknown request outcomes retain their reservation. Usage persists in the private `.local/cloud-usage.json`; do not delete it to restart a run.

`SUPPLIER_ENGINE=agent` selects semantic planning and live control discovery rather than the previous supplier adapters. This is an evaluation path: missing commercial facts stay unknown; alternative replacement validation remains unavailable in this engine. It currently uses page text and semantic DOM controls, not screenshot vision. Browser Use receives a temporary loopback proxy token and shares the same spending controls. Run `npm run acceptance:agent`, `npm run acceptance:workflow-agent`, and `npm run acceptance:agent-live -- johnstone` with the backend stopped. Synthetic checks establish control execution, not real supplier coverage.

For a repeatable **local-only model gate**, stop the backend and run `npm run test:local-model -- qwen3.5:latest`. This runs three repeats of six extraction/action cases plus native tool calls, then two independent Stagehand browser runs and two Browser Use recovery runs. The second Stagehand run includes zero inventory and unknown currency/condition. Override `EVAL_REPEATS` (1–10) and `BROWSER_REPEATS` (1–5) to increase repetitions. Each run uses randomized browser paths/control IDs and checks actual page state. The runner forces Ollama, clears cloud credentials from child environments, sets the cloud budget to zero, checks that the cloud usage ledger stayed unchanged, and exits nonzero if any check fails. Results and logs are saved under `.local/local-regression-<timestamp>/`. It never switches to Luna automatically. Passing this gate is necessary for local evaluation, not a guarantee of supplier coverage or beta readiness.

## Run

Requires Node 22.18+, Python 3.12, Chrome, uv, and a running Ollama server.

```sh
npm ci
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.lock
cp .env.example .env
npm run doctor
npm start
```

Open http://127.0.0.1:4310/flow for the guided user experience, or http://127.0.0.1:4310/ for the diagnostic console. The guided screen defaults to Collin's York example and runs live guide lookup, model confirmation, part capture, supplier sourcing and Step 6 comparison. The separate York fixture uses synthetic supplier data and synthetic model applicability. Do not present its prices or stock as real supplier observations. The API binds to loopback and is intended for a single local operator, not internet deployment or multiple shops.

`OLLAMA_MODEL` must be installed locally. No model is downloaded automatically at runtime. The initial configuration uses `qwen3:4b` (`ollama pull qwen3:4b`, approximately 2.5 GB). The previously listed model manifests on this machine referenced missing weight files; they could not run inference. The browser is a separate dedicated profile in `.local/chrome`; existing personal Chrome sessions are not modified. Sign in manually through the Connect buttons. Close other backend/smoke processes before starting one: only one process may own the project profile and CDP port.

## Verification

The latest actual guided UI → API → live suppliers → documented alternatives → comparison → restart checks and missed-branch fixes are recorded in [docs/validation/E2E_BRANCH_VALIDATION_2026-10-18.md](docs/validation/E2E_BRANCH_VALIDATION_2026-10-18.md). Processing passed; complete cheapest/closest commercial coverage remains incomplete. `npm run acceptance:guided-live -- --serve` runs that journey with the backend stopped. `npm run acceptance:journey-negative` and `npm run acceptance:api-contract` check its saved requests against the running server. Browser tests must run serially against the dedicated profile. `/flow?job=<id>` opens a specific saved result.

```sh
npm run typecheck
npm test
npm run test:guide-mutations
npm run smoke
npm run acceptance
npm run acceptance:guide
npm run acceptance:guide-ui
npm run test:parts-mutations
npm run acceptance:parts
npm run acceptance:capture
```

The smoke command must run while the backend is stopped. It starts a synthetic supplier page on port 4311, lets Browser Use + Ollama click Show availability, disconnects Browser Use, reconnects Stagehand, verifies the actual panel state, and runs Stagehand + Ollama structured extraction against known values. It records `.local/smoke.png` and prints token usage. This is real local model inference; no cloud API credentials are required. Allow time for cold model loading. A failure does not silently fall back to a remote model.

The acceptance command also runs while the backend is stopped. It verifies the actual demo console through Chrome: submit request, poll results, allow alternatives, verify persisted results and screenshot retrieval. It saves `.local/acceptance.png`. Run smoke and acceptance sequentially; a process lock prevents competing ownership of Chrome.

The default fixture API uses deterministic Stagehand browser reads of synthetic JSON. Set `simulateRecovery: true` to invoke Browser Use on hidden fixture availability panels. The separate smoke command exercises Stagehand's LLM callback. Fixtures cover the browser/API orchestration; they do not prove live supplier compatibility.

## Current step 2: reviewed York guide resolution

Steps 0 and 1 are treated as supplied intake. `GET /api/examples/step2` returns Collin's `York - E1RD036`, control board and capacitor, with Arlington VA 22201 and `mode: "live", stopAfter: "guide"`. Submit it to `/api/searches` for durable progress, or call `POST /api/guides/resolve` with `{"manufacturer":"York","model":"E1RD036"}` for a standalone resolution.

The current implementation checks a checksum-verified saved PDF first, then downloads one reviewed manufacturer-authored guide from a distributor mirror. It validates document identity, revision and literal model-column headings. It saves the PDF, extracted page text, retrieval date and SHA-256 locally. Cache reads verify PDF bytes and derive evidence from the PDF rather than trusting saved text. Parsed evidence may be reused in memory for an already verified content hash. PDF retrieval/parsing uses deterministic code without an LLM call; Stagehand remains the browser layer for interactive supplier pages. Qwen configuration is unchanged.

**Verified real-data outcome:** the guide lists `E1RD036S06B`. `E1RD036` returns `needs_model_confirmation` and a durable job pauses at `needs_input`. It does not assume the suffix, nor infer that a single match in this one document is the only equipment variant. An exact listed model returns `guide_found`; `E1RD036S46B` is rejected as not listed in this guide. No sourceable part numbers or offers are returned by step 2.

The document is historical Rev. E (0409) and contains only pages 1–3 of a document numbered "of 4". Those limitations accompany every result. `guide_found` means model coverage was observed, not that a complete current manual or installed-part compatibility was established. The actual full model for Collin's equipment remains unconfirmed.

Coverage is deliberately one reviewed York E1RD source. Manufacturer search, dealer portal, Johnstone guide search, Parts Town model search and general automated web discovery are **not implemented**. Cold-cache results identify those unavailable paths explicitly; this is the first step-2 slice, not a complete fallback crawler. Other equipment families return an honest unsupported/missing result.

`npm test` includes offline guide failure-injection, API/worker, cancellation and persistence regressions. `npm run test:guide-mutations` creates temporary source/test copies and verifies the tests reject three deliberately introduced bugs; it leaves the working sources unchanged.

`npm run acceptance:guide` downloads the real PDF into a temporary directory and verifies prefix handling, exact/wrong suffixes, offline cache reuse and checksum-corruption rejection and cached-text tampering. `npm run acceptance:guide-ui` exercises the console, API, PDF evidence, persistence and clarification using Stagehand/Chrome. Stop the backend before the UI check; it owns port 4310. The UI test's exact suffix is only a test of document coverage, not a user-confirmed nameplate.

## Step 3: parts from the verified model column

`GET /api/examples/step3` returns `mode: "live", stopAfter: "parts", model: "E1RD036S06B"` with control board and capacitor. This is an explicit test model, not confirmation of Collin's installed equipment. Create a durable `/api/searches` request, or call `/api/guides/extract` with manufacturer, full model and `lines: [{"name":"capacitor","quantity":1}]`. Abbreviated or unlisted models cannot produce parts.

The supported E1RD table parser reads each model header and requires exactly one explicit part-number/`---` cell per model. It selects the requested full model's column, preserves the original header/row/page and records the guide SHA-256, revision and source URL. Missing, extra or unrecognized cells require review. A page cannot inherit a header from another page. This static, text-bearing table is parsed deterministically with no model call; Stagehand remains the browser interaction layer and Qwen settings are unchanged.

For this test model, the historical guide yields `S1-33101975102` (`Control, Defrost`) as a candidate for the broad request "control board", and `S1-02425893000` (`Capacitor, Run`, 40/5 MFD). "Control board" requires clarification because the description is broader than the guide row. Edit that request line to "defrost control" and submit clarification if that is the component intended. A generic capacitor request with multiple applicable types also requires clarification. `---` rows are excluded; unknown descriptions return `not_found`. Voltage is not provided by these rows and remains null.

A step-3 job completes only when every line has one supported description match; otherwise it pauses at `needs_input`. `job.parts` contains per-line candidates, statuses, specifications, excluded rows and evidence. `job.results` remains empty: no supplier search runs and extracted historical identifiers are not promoted to current compatibility or stock claims. The incomplete mirror, historical revision, serial applicability and supersession warnings remain visible.

Coverage is limited to the reviewed E1RD table grammar and explicit description/alias rules. It is not general PDF/OCR understanding. The shared request schema's `stopAfter` accepts `guide`, `parts`, `capture` and `sourcing`; existing exact-part sourcing remains separate. Name-only live requests using `stopAfter: "sourcing"` still stop after guide resolution unless started through the reviewed `/source` handoff.

`npm test` includes column, ambiguity, missing-cell, wrong-model, API and persistence regressions. `npm run test:parts-mutations` proves the tests reject four intentionally faulty temporary implementations. `npm run acceptance:parts` runs real PDF extraction through Stagehand/Chrome → API → SQLite → clarification and confirms no supplier offers are returned. Stop the backend before this browser check. Screenshot: `.local/step3-acceptance.png`.

## Step 4: capture selected guide parts

The original document numbers capture of identifiers/descriptions/specifications as step 4, followed by supplier searching as step 5. Step 3 already extracts candidates. `GET /api/examples/step4` now starts a `stopAfter: "capture"` job against the explicit test model. Such jobs pause for review even when every component has a unique description match. The console requires one explicit component selection per requested line before enabling **Capture selected parts**.

`POST /api/searches/:id/capture` accepts only a snapshot timestamp, guide hash, model basis (`test_model` or `user_confirmed_model`) and `{lineIndex,candidateIndex}` selections. It never accepts replacement identifiers or specifications from the client. The server revalidates the guide and PDF, re-extracts candidates, checks each choice against the displayed evidence, rejects unreadable/missing rows, and rechecks job state after the asynchronous reads. It saves `job.capturedParts` atomically with the job, including requested names/quantities, part numbers, guide descriptions/specs, source rows/pages/model columns, confirmation basis and warnings. Unknown voltage remains null.

An identical replay returns the original capture; a different finalized capture, stale timestamp/hash, duplicate/missing selections, cancellation or changed evidence returns a conflict. The snapshot survives restarts. A test model stays explicitly labelled; user-asserted equipment model confirmation does not imply independent verification of installed compatibility. Historical supersessions and alternative specifications remain unverified.

The endpoint also works on existing live step-3 `parts` jobs with reviewable candidates. A capture completes step 4 and does not search suppliers. Existing extraction states remain an audit trail: a candidate originally requiring clarification may be captured after an explicit selection without rewriting its original extraction status.

Example body (use the actual job values):

```json
{
  "expectedUpdatedAt": "2026-10-17T00:00:00.000Z",
  "expectedGuideSha256": "331d0f3992a3e46c3196c8832b409b5a48941eccc091e094cdfb72bb5eeb804a",
  "modelBasis": "test_model",
  "selections": [{"lineIndex": 0, "candidateIndex": 0}, {"lineIndex": 1, "candidateIndex": 0}]
}
```

`npm run test:capture-mutations` proves the regression tests reject changed-evidence acceptance and cancellation overwrite.

`npm run acceptance:capture` verifies real guide evidence, required UI selections, saved identifiers and unknown specs, explicit test-model basis and SQLite persistence. Stop the backend before running it; screenshot: `.local/step4-acceptance.png`.

## Step 5: exact-number supplier sourcing from a saved capture

Use **Open latest captured request** to resume an existing capture. Select suppliers and click **Start / resume exact supplier search**. The original guide and capture remain unchanged; the API creates a separate durable sourcing job using only the saved manufacturer identifiers, quantities and selected supplier scope. It preserves the test-model basis and source evidence. Repeating the same capture/scope resumes the same job; it does not silently refresh observations. For failed/partial jobs, reconnect the supplier and use Retry to refresh evidence.

`POST /api/searches/:id/source` takes `expectedCapturedAt` and `suppliers`. It returns 202 for a new child or 200 for an existing one. No client part-number overrides are accepted. `job.sourceCapture` points to the original capture. Each result includes `attempts` with supplier, exact query, timestamp, `found`/`no_match`/`error`, error code when applicable, and screenshot evidence when the browser could capture a page. Empty/challenged/unverified pages are errors, not no-stock conclusions. A completed visible no-results page may produce `no_match`.

Johnstone sign-in was verified with the supplied account at Alexandria #461, offered for Arlington ZIP 22201. Account-specific product prices and branch inventory still require independent supplier-page evidence. Use the connection controls with sourcing idle, then retry a partial job.

Parts Town supports reviewed public product labels as a deterministic extraction path. It preserves manufacturer part number separately from Parts Town SKU, handles punctuation-equivalent identifiers, records seller/ship-from information, and labels `access: public_catalog` with `priceBasis: public_displayed`. A third-party seller is identified in the reason and seller field. Those observations do not assert authenticated account pricing. Grainger uses bounded product-detail navigation and local Qwen/Stagehand extraction with visible-text checks; it may return a verified listing, unknown price or a structured failure. Login detection, site markup and search behavior can change, so these are pilot adapters rather than guaranteed coverage.

Live offers always leave local branch quantity and pickup readiness unknown until branch validation exists. Product-page company-wide or shipping stock cannot enter pickup/closest rankings. Unknown condition, purchase unit, pack size or currency likewise prevents a comparable sourcing claim. A screenshot filename is unique per observation, including no-match and error pages.

If any supplier fails, the job is `partial`; useful exact listings remain available. Failed scope never triggers a completed-scope no-match claim. If all checks succeed and a line has no exact match, the job pauses at `needs_permission`. Captured-part sourcing remains exact-only: allowing alternatives returns `ALTERNATIVE_SPECIFICATIONS_UNVERIFIED` until the missing specifications and replacement evidence are addressed. Declining ends the job. Existing synthetic fixture permission tests remain separate and labelled.

**Live verification:** the end-to-end Chrome check found public exact board listings at Parts Town and Grainger. Parts Town returned an explicit no-match page for the historical capacitor number. Johnstone returned `AUTH_REQUIRED`, and Grainger's capacitor product details could not be verified. The job correctly reported partial results and no local inventory claims. Site results and public displayed prices vary by run, seller and session; observed listings do not establish installed compatibility or a current replacement recommendation.

Verification: `npm test`, `npm run test:sourcing-mutations`, and (backend stopped) `npm run acceptance:sourcing`. The browser acceptance runs six live checks and requires real public board evidence; it can fail when supplier pages change or become unavailable. It uses the existing local model and no paid services. The synthetic `npm run acceptance` remains an independent orchestration regression, not evidence of live supplier success.

## Supplier login and bounded live Browser Use recovery

Stagehand remains the primary browser layer. When an exact search cannot identify the product detail page but exposes supported product links, the adapter can hand the **same tab** to Browser Use with local `qwen3:4b`, then reconnect Stagehand and validate product identity. Recovery is now enabled on the three explicit supplier domains, with one supplier domain per run, at most 12 product candidates, configured step/time limits and independently checked navigation. The Python agent exposes only `open_product(candidate_index)` plus completion; generic click, input, arbitrary URL navigation, filesystem actions and account/cart/order controls are unavailable. Website text cannot add tools or URL destinations.

An agent's claimed success is insufficient. It must execute an allowed navigation and pass the URL postcondition; the supplier adapter must still validate the resulting manufacturer/part number. Failed recovery is a supplier error, not a no-match conclusion. Missing product candidates, account-store ambiguity, CAPTCHA and MFA are not solved by inventing a destination or bypassing the site. `attempts[].recovery` records attempted navigation and its verified outcome. Local fixture recovery still exercises the original reveal-panel flow.

The local guided flow automatically signs in to Johnstone and Parts Town after an `AUTH_REQUIRED` response, then retries that exact read-only supplier query once. Automatic sign-in is limited to one attempt per supplier per sourcing job. Credentials are loaded from `.local/supplier-credentials.json`, which is covered by the repository's `.local/` ignore rule and must have owner-only permissions (`0600`). The file is machine-local and is not committed. No credentials are saved to SQLite, search jobs, recovery conversations, screenshots or model prompts. Browser cookies remain in the dedicated local Chrome profile. If a supplier rejects the login or requires a human challenge, the result stays explicitly unresolved and the manual sign-in fallback remains available.

`POST /api/connections/:supplier/login` still supports a one-time manual login with username/password, optional account ZIP and Johnstone store number, and optional `rememberSession` (default true). It uses deterministic Stagehand form controls, not model prompts. Request bodies are not logged and credentials are discarded from application references after the request. This does not promise cryptographic memory erasure or indefinite supplier sessions.

Login returns `authenticated` only after a supplier signed-out/log-out control is observed, otherwise an explicit unverified/rejected/challenge/store-selection state. `GET /api/connections/:supplier/status` verifies current browser evidence rather than trusting a previous login result. The console exposes separate credential forms for Johnstone and Parts Town. Grainger has no credential step.

The supplied Parts Town login was accepted; its signed-in session also survived a backend/browser restart. For Arlington ZIP 22201, Johnstone offers Alexandria #461 rather than an Arlington-named store. With the user's authorization, selecting #461 and submitting the supplied credentials reached an authenticated `/store461` page. This verifies that login attempt, not branch inventory, pricing, or installed-equipment compatibility. Store options load asynchronously; the adapter waits for the requested option before selecting it.

Verification: all 67 offline tests pass. `npm run acceptance:live-recovery` proves real Browser Use/local Qwen product selection on Johnstone, same-tab handoff and subsequent Stagehand part-number verification. `npm run smoke` still verifies both local model/browser frameworks and fixture handoff. Stop the backend before these browser scripts. They do not use login secrets. The supplier credentials were exercised separately through the local credential endpoint without saving them to a script.

## API for Collin

All writes use `Content-Type: application/json`. The default allowed frontend origin is `http://localhost:3000`; set `FRONTEND_ORIGIN` for Collin's local dev origin. A browser frontend can also use a same-origin reverse proxy. This local API has no production authentication and must not be exposed publicly.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Ollama reachability, installed models, Stagehand inference counters |
| GET | `/api/example` | Synthetic York request body |
| GET | `/api/examples/step4` | Test-model component capture request |
| POST | `/api/searches/:id/source` | Create/resume exact supplier sourcing from captured parts |
| POST | `/api/searches/:id/capture` | Revalidate and save explicit component selections |
| GET | `/api/examples/step3` | Explicit full test-model request for step 3 |
| POST | `/api/guides/extract` | Verified model-column extraction with candidates and evidence |
| GET | `/api/examples/step2` | Collin intake for real guide-resolution demo |
| POST | `/api/guides/resolve` | Reviewed catalog lookup; inspect status, provenance and warnings |
| GET | `/api/guides/:hash/document` | Checksum-verified saved PDF |
| GET | `/api/openapi.json` | OpenAPI 3.1 contract for frontend integration |
| POST | `/api/searches` | Create a durable request; returns 202 and ID. Optional `Idempotency-Key` header |
| GET | `/api/searches/:id` | Poll state, partial results, supplier errors, evidence, and events |
| POST | `/api/searches/:id/clarification` | Submit corrected model or line items when needs_input |
| POST | `/api/searches/:id/alternatives` | `{ "allow": true }` or false, only in needs_permission |
| POST | `/api/searches/:id/cancel` | Stop further work; current browser operation may finish |
| POST | `/api/searches/:id/retry` | Refresh a failed or partial request after reconnecting |
| POST | `/api/connections/:supplier/login` | One-login credentials; verify session without saving secrets |
| GET | `/api/connections/:supplier/status` | Inspect current signed-in supplier evidence |
| POST | `/api/connections/:supplier/open` | Open Johnstone/Parts Town/Grainger for manual login |
| GET | `/api/searches/:id/evidence/:file` | Read an offer's screenshot |

Example fixture request:

```sh
curl http://127.0.0.1:4310/api/searches \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-york-1' \
  -d '{"mode":"fixture","model":"E1RD036S46B","lines":[{"name":"control board","quantity":1},{"name":"capacitor","quantity":1}]}'
```

An abbreviated model returns `needs_input`. The full fixture model resolves synthetic expected identifiers. The board has an exact fixture offer at Johnstone. The capacitor has no exact fixture offer and pauses for alternatives permission. Alternatives remain explicitly unverified and excluded from automatic ranking.

Live exact-part request after manually connecting Johnstone:

```json
{
  "mode": "live",
  "suppliers": ["johnstone"],
  "lines": [{"name":"control board","manufacturer":"York","partNumber":"S1-33101975102","quantity":1}]
}
```

Identifiers in the example are historical candidates, not a verified fit for every E1RD036 variant.

States: queued, running, needs_input, needs_permission, completed, partial, failed, cancelled. Completed means processing finished, not that a part was found. A restarted backend requeues interrupted read-only searches; saved jobs and permission decisions survive. The worker serializes Chrome ownership, including Stagehand/Browser Use handoffs. Never run concurrent processes against this profile.

Each offer reports exact/alternative/unverified match, manufacturer part number, supplier SKU, price/unit/pack size, observed time, source URL, evidence, synthetic flag, eligibility, and material-cost total. Alternatives and identity uncertainty cannot win rankings. A material-cost total may be known without sufficient stock. Only confirmed new exact offers with comparable units/currency and sufficient verified pickup stock enter sourcing rankings in this milestone. Unknown stock remains null; ship-only ranking awaits verified fulfillment support.

## Current implementation boundary

- Working local workflow foundation, fixture sourcing, permission/clarification/cancellation, SQLite persistence, screenshots, shared-browser recovery, Ollama adapters, and demo console.
- Live adapters are experimental: bounded search navigation, authentication/challenge detection, visible product-link lookup, schema extraction, and basic evidence checks. They deliberately withhold local stock/pickup claims until branch verification is implemented. They may return AUTH_REQUIRED, SITE_CHALLENGE, or EXTRACTION_UNVERIFIED rather than guessing.
- General model-to-guide discovery beyond the reviewed York catalog, OCR/voice intake, verified compatibility/specification alternatives, general-purpose commercial coverage beyond the Step 6 pilot below, selection/quotes/exports/email, production authentication/tenant separation, and deployment are not implemented. Name-only live requests return needs_input with an explicit reason.
- Browser Use live recovery is bounded to approved product candidates on the three supplier domains; it does not have broad account or ordering controls.
- Single-machine profile, not a multi-shop session system. UI clicks during an active sourcing job can interfere; finish manual sign-in before running a request.
- Evidence and profiles can contain account-sensitive data. `.local/`, `.env`, and `.venv/` are ignored. Do not commit them or publish the loopback CDP endpoint. Credentials are never embedded in this repository.

## Files

`src/browser.ts`: browser lifecycle and exclusive handoff. `src/ollama.ts`: local callback. `python/recover.py`: bounded Browser Use worker. `src/worker.ts`: sourcing state machine. `src/domain.ts`: matching and ranking. `src/store.ts`: durable SQLite state. `src/suppliers.ts`: fixture and pilot live adapters. `public/index.html`: developer demo console.

This implementation keeps the original source files unchanged. See docs/BACKEND_EXECUTION_PLAN.md for the full product roadmap and docs/BROWSER_AUTOMATION_RESEARCH.md for the preceding research.


## Exact supplier coverage validation

See [docs/validation/SUPPLIER_COVERAGE_VALIDATION.md](docs/validation/SUPPLIER_COVERAGE_VALIDATION.md) for the current live coverage matrix and limitations. With the backend running and supplier connections authenticated, run `npm run acceptance:supplier-coverage` for two fresh rounds of Collin’s six exact catalog queries. This checks query outcomes and screenshot delivery, not branch stock or alternative compatibility. The new supplier regressions bring the offline suite to 73 tests.

Johnstone exact S1 service-part matches can preserve the supplier label Source 1 and include `identityEvidence` for the reviewed York service-brand relationship. Grainger’s query-specific no-results title plus visible suggestion heading prevent unrelated suggested products from entering exact recovery. Johnstone can require reconnecting after a cold restart; the remember checkbox did not preserve authentication in this environment.


## Documented alternatives review

Captured exact-search jobs now have a separate evidence-backed review path: `POST /api/searches/{id}/alternatives/review` with `{expectedUpdatedAt, allow:true, installedVoltageVac?}`. The console exposes **Review documented alternatives**. Reviewed candidates are S1-02425893700 and the OEM-listed successor S1-CAP4405040DR for historical capacitor S1-02425893000. Multi-step reference authority is preserved. It verifies the live supplier cross-reference and OEM candidate specs, then checks its identifier across all three suppliers. These remain alternative candidates, excluded from installation approval and rankings until missing compatibility evidence is resolved. Exact results and the capture remain intact. See [docs/validation/ALTERNATIVES_VALIDATION.md](docs/validation/ALTERNATIVES_VALIDATION.md) for the API, evidence, verification rules and live results. Run `npm run acceptance:alternatives` against the authenticated local backend; the current regression results are tracked in the validation reports below.

Alternative references use a validated, dated cache for transient source outages (maximum 24 hours), clearly labelled when refresh fails. Grainger complete small result sets can include individually inspected nonmatching products in `attempts[].noMatchEvidence`; this is a query-level conclusion, not a catalog-wide absence claim. See the validation report for the exact guards and remaining installation requirements.


Step 5 hardening and repeatable live fault tests are documented in [docs/validation/STEP5_STRESS_VALIDATION.md](docs/validation/STEP5_STRESS_VALIDATION.md). `npm run acceptance:step5-stress -- --serve` exercises the normal path, forces Browser Use/Qwen recovery at every supplier twice, injects missing-model and deadline failures, races duplicate requests, and cancels real work. Stop the existing backend first; sign in through the local credential API at the READY prompt. Forced recovery is process-local test instrumentation and is unavailable through the public request schema. `npm run test:step5-mutations` deliberately breaks identity, browser ownership, exact-link and query-absence rules to prove the regression assertions detect them. Exact live facts now require reviewed product parsers after either navigation path; an unknown layout fails for review instead of using model-extracted page-wide text as identity proof.

The additional reordered-candidate, unfamiliar-layout and crash/restart checks are tracked in [docs/validation/STEP5_UNKNOWN_VALIDATION.md](docs/validation/STEP5_UNKNOWN_VALIDATION.md), including the initial failures and fixes. Run `npm run acceptance:unknown-recovery -- --serve` separately from the backend. `npm run acceptance:browser-restart` uses its own isolated Chrome profile and port to test an actual owner crash and recovery. The current offline suite has 123 passing tests; the expanded unknown suite passed 13 cases. Live outcomes are reported separately and must not be inferred from the offline count. Semantic recovery traces distinguish model-selected indices from bounded application completion. Both paths require the same reviewed main-product identity and final Node verification.

To inspect a completed alternatives review without starting another live search, run `npm run acceptance:alternatives -- <job-id> --verify-only`. It verifies the candidate/specification rules and every saved reference/product evidence endpoint. To prove capture immutability across an external console action, retain the pre-action API snapshot and compare the final `capturedParts`, `sourceCapture` and exact `results` as well.

### Step 6 comparison pilot

Use the console's **Open latest supplier results** → **Step 6 · Compare fresh supplier information**, or `POST /api/searches/{id}/compare` with `{expectedUpdatedAt, requestId?, origin?}`. This creates a separate refreshed exact-only child and preserves the source job. Read `job.comparison.lines[].rankings` for independently gated cheapest, closest and fastest-shipping categories, with evidence and missing-data reasons. A new UUID `requestId` starts a refresh; resending it reuses that refresh. Evidence expires for ranking after 15 minutes, and GET clears expired winners.

Real data currently supports a Grainger one-unit arrival estimate to Arlington 22201 and observed branch addresses, while cheapest and ready-in-stock pickup remain unverified. Shipping stock is never treated as local branch stock, and future pickup is excluded from ready-now ranking. Origin ZIP-only distances use an explicitly approximate official Census reference point for 22201. Other origins need a full street address or coordinates. No paid geocoding fallback is enabled.

See [docs/validation/STEP6_VALIDATION.md](docs/validation/STEP6_VALIDATION.md) for the API, observed live results, scope limits, 145 offline regressions, seven caught mutations, and six live acceptance scenarios including the Step 5 Browser Use/Ollama regression. Run `npm run acceptance:comparison -- --serve` with the other backend stopped, or `npm run test:comparison-mutations` for offline fault checks.


Fresh end-to-end browser validation from guide through capture, three-supplier exact sourcing, Step 6 comparison and persisted restart is recorded in [docs/validation/E2E_VALIDATION.md](docs/validation/E2E_VALIDATION.md). The comparison expiry UI and real Browser Use/Ollama recovery at all three suppliers were included.

The cleaner API-connected walkthrough at `/flow` is described in [docs/validation/FLOW_UI_VALIDATION.md](docs/validation/FLOW_UI_VALIDATION.md), including a live Playwright run through guide confirmation, capture, supplier checks and comparison.
