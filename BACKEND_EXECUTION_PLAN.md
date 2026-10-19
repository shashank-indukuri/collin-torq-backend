## October 18 Step 6 comparison pilot

Added a separate immutable-source comparison refresh, product-bound commercial observations, Census origin/address resolution, address-only branch caching, straight-line proximity, independent cheapest/closest/arrival rules and evidence expiry. The live York test recovered a one-unit Grainger arrival estimate for 22201 and 25 future-pickup branch records; Johnstone location was geocoded (8.44 approximate straight-line miles); its final console observation loaded a numeric price, but purchase basis and branch stock remained unverified. Cheapest and ready-stock pickup correctly remain unverified. All 145 offline regressions, seven intentional mutations and six live comparison/regression scenarios passed, including fresh console capture through comparison and forced Browser Use/Ollama recovery at all three suppliers. See [STEP6_VALIDATION.md](STEP6_VALIDATION.md) and [E2E_VALIDATION.md](E2E_VALIDATION.md); this is not complete verified commercial coverage or installed-compatibility approval.

## October 18 Step 5 unknown-scenario hardening

The expanded suite passed 13 real/controlled unknown-scenario checks, 123 offline regressions, eight caught mutations and an isolated real Chrome owner crash/restart. All three suppliers passed a correct-candidate-last test. Qwen recovered an intentional wrong first choice; unfamiliar semantic cards exposed model repetition, now handled by bounded application completion with exact live identity checks and separate trace fields. SDK startup cleanup and transient page-load verification were fixed. The broader stress suite also passed all 14 scenarios against these final changes, followed by eight negative/retry supplier checks, five rejected invalid requests and a fresh console capture → source → alternative-review flow with 12 supplier checks and unchanged capture/exact results. See [STEP5_UNKNOWN_VALIDATION.md](STEP5_UNKNOWN_VALIDATION.md) for evidence and remaining beta limits.

## October 17 documented alternative review update

Current Step 5 hardening: 111 offline regressions, four caught source mutations, 14 live stress scenarios including six forced Browser Use/Qwen runs, eight additional negative/retry observations, and a six-check alternatives regression passed. Recovery process ownership, tab lifecycle, exact identifiers, query-specific no-match proof and main-product identity validation were hardened. See [STEP5_STRESS_VALIDATION.md](STEP5_STRESS_VALIDATION.md) for evidence and the supervised-beta scope. Earlier updates below are historical milestones.

Implemented a consented documented-alternatives review for the unresolved captured capacitor: S1-02425893700 and S1-CAP4405040DR, with source authority preserved across the full reference chain. All six candidate/supplier checks passed, followed by six original-number regression checks and 92 offline tests. Supplier claims remain distinct from OEM authority. Validated reference snapshots support transient source outages for up to 24 hours with explicit timestamps and cache warnings; Grainger small complete query sets retain inspected nonmatching product evidence. Exact results and original capture stay immutable. Installed voltage, OEM authority for the original replacement link and physical fit remain missing, so alternatives remain excluded from installation approval and rankings. See ALTERNATIVES_VALIDATION.md for current scope and evidence. Earlier updates below describe prior milestones.

## October 17 step 5 update

Implemented explicit reviewed capture → exact supplier sourcing handoff as a separate durable child job. The parent stays immutable and test-model context survives. Per-supplier outcomes distinguish found, explicit no-match and error, with screenshot evidence. Public Parts Town/Grainger board listings were verified through the application runtime; Johnstone account access remains unconnected/unverified and is reported as AUTH_REQUIRED. Public catalog prices, third-party sellers and unknown local inventory are explicit. The live pilot returned partial, not a false complete no-match result. Captured alternatives remain blocked until missing specifications/replacement evidence are resolved. This is not a claim of production-ready authenticated supplier coverage.

## October 17 step 4 update

The source document's step 4 captures part numbers, descriptions and specifications; supplier search starts at step 5. Implemented explicit component review and durable capture from step-3 candidates. Saved records retain model basis (test vs user-confirmed), original source evidence, quantities, unknown specifications and historical-guide caveats. Server revalidation rejects stale snapshots, invalid selections, unreadable rows and cancellation races. No supplier search is triggered by capture. The default console demonstrates step 4 with the explicit E1RD036S06B test model.

## October 17 step 3 update

Implemented historical guide-part extraction for the explicit test model E1RD036S06B. The original E1RD036 intake still needs model confirmation. The reviewed table produces a defrost-control candidate and the applicable run capacitor, with exact-column evidence and unknown voltage preserved. Broad "control board" requests pause for component clarification. Missing cells, multiple candidates, unsupported terminology and not-applicable markers cannot silently produce a confirmed answer. API, durable jobs and developer console expose `parts`; supplier lookup remains separate. See README for endpoints and verification commands.

## October 17 scope correction: start at step 2

Steps 0 and 1 use Collin's supplied intake. Proximity, selection and exports are deferred. The first step-2 slice now resolves the reviewed real York E1RD PDF, verifies/cache-checks its bytes, stores provenance and page evidence, and requests model confirmation for E1RD036. The guide lists E1RD036S06B; no suffix is assumed for Collin. The mirror is a historical incomplete 3-of-4-page copy and these warnings remain visible. General fallback discovery is outstanding. Step 3 now parses the reviewed E1RD model table with page/column evidence, explicit ambiguity and a separate test model; no supplier handoff runs from extracted candidates yet. See README for acceptance commands and API contracts.

# Torq Slim backend execution plan

Prepared October 17, 2026. This plan is based on the two supplied files. A first local implementation now exists; live supplier verification remains outstanding.

## Local implementation status

Implemented the selected Stagehand 4.2.1 / Browser Use 0.13.11 / Ollama stack with a dedicated Chrome profile, exclusive browser ownership and handoff, SQLite-backed sourcing jobs, validation, clarification, alternatives permission, cancellation/retry, screenshot evidence, OpenAPI contract, and a local demo console. The model configured for this machine is qwen3:4b; it was downloaded after previously listed Ollama manifests proved to have missing weight files.

Verified real local-model browser actions through both frameworks, Stagehand structured extraction, and same-page handoff with an independently checked postcondition. Verified the synthetic York demo through the browser UI, API, SQLite, permission action, and evidence retrieval. These checks establish the local integration, not live supplier coverage.

The live adapters are conservative pilot code. Broader live model-to-guide discovery, verified local branch availability, specification-based compatibility, location/shipping ranking, quotes/exports/email, and production shop isolation remain roadmap work. The demo uses visibly labelled synthetic data. See README.md for commands, API usage, and exact limitations.

The objective is a dependable backend that Collin can connect to his frontend. A successful response must identify the requested part correctly, report supplier evidence accurately, and make missing information or failed supplier checks visible. A product page alone is not a successful sourcing result.

## Updated first milestone from Collin's October 14 email

The supplied email narrows the initial demonstration to York E1RD036 with two requested parts: control board and capacitor. Johnstone Supply and Parts Town have supplied account access; Grainger is explicitly included as a public source. Login validity, MFA, account location, and suitability for unattended backend operation remain untested. Credentials are intentionally excluded from this plan.

Collin's expected results are hypotheses to verify against current product and applicability evidence:

| Source | Control board | Capacitor |
| --- | --- | --- |
| Johnstone Supply | Carries requested part | Alternative expected |
| Parts Town | Alternative expected | Alternative expected |
| Grainger public | No answer key supplied | No answer key supplied |

This updates the initial supplier shortlist: start with Johnstone, then Parts Town, then public Grainger. Do not begin with Ferguson or Trane unless pilot priorities change.

Build the exact-number supplier lookup underneath this demonstration, but make the first user-visible proof the complete York model-and-part-name request. It must either resolve applicability with evidence or request the full model suffix/nameplate information. The email does not establish that E1RD036 alone uniquely identifies the correct variant.

Use a small reviewed historical fixture set while developing and bounded live checks to verify the real integration. Log per-run time, external-call count, model cost, and the reason for each result. Collin reports nine days, three failed build plans, and $75 in prior Claude API usage; the first deliverable should therefore be a reproducible result and API response for this case before widening scope. Do not invent a spending cap; agree one before sustained paid experiments.

Keep exact matches, documented supersessions, and alternatives distinct. The documented consent rule still applies: the expected alternatives do not establish that automatic alternative search is allowed in the product. Also clarify whether alternatives should be offered when an exact part exists at another connected supplier; the current flow only opens that path after no exact return across authenticated suppliers.

The linked Google user-flow document was read on October 17 and retains the same core sequence as the local copy. The linked workbook was identified by the connector as an Excel file; its remote cell contents were not compared with the local workbook during this update. No live supplier login or sourcing check has been performed.

## Source material and current state

- `10_07_2026_ Torq Slim Back End User Flow.docx`: intended workflow, guide lookup order, consent before alternatives, branch proximity, quote and export actions. Comments identify batches 2 through 5 and say to reuse existing code for the final selection/quote/export section.
- `Run 3 Parts Availability Test 2026-10-01 v4.xlsx`: all ten tabs reviewed, including Method, the master list, the October 15 MVP benchmark template, the consolidated results, Tests 1–3, and Runs 4–6.
- Only these two source files were present in the project folder. No backend, frontend integration contract, deployment configuration, or reusable quote/export implementation was supplied.

The master list contains 75 line items across equipment-specific parts, general mechanical supplies, and supplier-specific identifiers. These are not 75 verified successes or 75 unique parts. Some cases repeat, lack quantities, or identify multiple possible parts. The October 15 MVP tab is largely an unfilled benchmark template. The consolidated tab repeats historical runs and must not be treated as an independent test population.

## Intended workflow

1. Receive an origin from device coordinates, a saved office address, or a manually entered address. Device permission and location capture belong to the frontend; the backend validates and stores the submitted origin.
2. Receive equipment information through a nameplate image, text, or voice transcription, along with the requested parts and quantities. Exact part-number entry bypasses equipment-guide lookup. Description-only supply requests need an explicit path too, as demonstrated by the workbook.
3. Check the saved guide database first. If no applicable guide exists, try the manufacturer's public guide, the shop's dealer portal, Johnstone Model-to-Part in the shop's session, public Parts Town model pages, and open-web guide search, in that order. If the equipment or part cannot be verified, request the missing information or return an honest unresolved result.
4. Confirm guide applicability to the full equipment model and any required voltage, suffix, serial range, or revision. Search its parts section and retain the source, page or item reference, part number, description, specifications, and supersession evidence.
5. Search connected authenticated suppliers for exact parts. Report supplier failures separately from completed searches with no match. If no exact result exists across the completed scope, pause for permission before searching alternatives by verified specifications and controlled query variations.
6. Normalize comparable prices, quantities, purchase units, branch stock, shipping information, and timestamps. Resolve unfamiliar branch addresses through supplier location pages, then web evidence when necessary; geocode through the requested Census-first, Geocodio-fallback approach. Its implementation and validation limits still need verification.
7. Return the cheapest eligible option, closest eligible pickup branch, and fastest evidenced shipping option, with the scope and basis of each comparison visible.
8. Save the user's selection per line item. Support quotes using the agreed pricing formula, raw text, CSV, and user-triggered email.

## Findings that affect implementation

### Identity and availability need separate evidence

The Method tab defines Found as an exact match with a logged-in price and sufficient quantity. Historical entries do not consistently satisfy that definition: some are alternatives, some say call for availability, and some explicitly describe uncertain matches. Test 1 even includes unrelated suggested products. Historical labels are useful evidence to review, not authoritative expected answers.

Model prefixes are insufficient in several cases. Run 5 records that the full Trane nameplate model resolved a different variant from the family prefix. Run 6 leaves Carrier cases unresolved because exact model applicability, voltage, or the requested sensor identity could not be established. Those are required clarification and honest-failure tests.

### Identifiers need supplier context

Run 4 shows Ferguson catalog numbers differing from manufacturer numbers. BB61 also collides with unrelated products across suppliers. Store manufacturer, manufacturer part number, supplier SKU, supplier item identifier, category, and evidence separately. Normalize punctuation only through explicit rules; do not erase meaningful suffixes or infer universal mappings from similar strings.

### Comparisons need units and fulfillment context

The workbook includes each versus packs, price per foot versus pipe lengths, replacement parts requiring adapters, new versus refurbished conditions, and local versus distribution stock. A comparison must use the requested quantity and an explicit purchase basis. Company stock is not branch stock; future pickup is not immediate pickup; call for availability is unknown availability.

Prices and availability in the workbook are historical observations. They have not been refreshed. Preserve historical snapshots for tests and collect fresh evidence for live use.

### Benchmark formulas need reconciliation

In Test 2, AW can return Yes for any numeric price or a Carried but zero stock label. BC then classifies AW=Yes as Found at our houses. Its later zero-stock branch checks only three supplier columns. Test 1's computed found flag omits Grainger despite containing Grainger results. These formulas cannot become backend acceptance logic unchanged.

The Method tab's greater-than-10% No value add stop condition needs a cleaned denominator and completed classifications before it can support a project decision. Missing supplier access must not automatically become No value add. The referenced Summary tab is absent.

## Proposed execution sequence

| Milestone | Work | Completion evidence |
| --- | --- | --- |
| 0. Establish scope and access | Obtain existing code and frontend expectations; agree pilot shop, origin, suppliers, session connection method, and initial supported cases. Clean benchmark records without changing the originals. | Agreed API outline, traceable case list, access matrix, and explicit unresolved dependencies. |
| 1. Prove a live sourcing slice | Accept an exact manufacturer or supplier-specific part number and quantity. Search one authenticated supplier through the intended runtime, collect price and branch stock, and return structured evidence. Add a second supplier to prove normalization and comparison. | Repeatable live runs, reconnect behavior, expired-session handling, unknown-stock behavior, and no cart or order changes. |
| 2. Establish the backend foundation | Implement shop/user separation, durable search jobs, supplier adapters, result snapshots, evidence storage, progress, structured errors, timeouts, bounded retries, cancellation, and request deduplication. | A worker restart does not lose a search; retries do not duplicate records; one failing supplier leaves usable results from others. |
| 3. Resolve equipment to parts | Add intake extraction and confirmation, guide cache and fallback sequence, model applicability, part extraction, and supported supersessions. | Verified cases resolve with source evidence; ambiguous Carrier and capacitor cases request clarification rather than choosing a part. |
| 4. Add alternatives and ranking | Persist permission, run specification-based alternative searches, resolve branches, and rank eligible offers. Expand suppliers individually after each adapter passes its checks. | No alternative search before permission; missing specifications prevent an unsupported equivalence claim; pickup, quantity, units, cost basis, and ETA rules pass reviewed cases. |
| 5. Complete frontend integration and outputs | Save selections, reuse quote/export code where suitable, implement agreed quote math, text/CSV, and explicit email delivery. Provide a staging backend and integration package. | Collin completes the full workflow from his frontend, including clarification, reconnection, partial results, selection, and export. |
| 6. Pilot and handoff | Run the cleaned benchmark and repeated live tests in the agreed account/location context. Measure correctness, coverage, latency, failures, freshness, and cost. | Recorded pilot results, operating instructions, deployment and rollback procedure, and an agreed support boundary. |

The exact-part sourcing slice should be delivered first while the equipment-to-part path is developed next. This gives Collin an early working integration and tests the most consequential dependency: account-specific supplier access. It is a sequencing choice, not removal of the documented intake workflow.

Do not estimate a committed completion date until Milestone 1 establishes access and repeatability. Use milestone acceptance gates to control scope and supplier expansion.

## Proposed architecture and integration contract

### Selected local demo stack

User direction supersedes the hosted-browser recommendation for testing and demo: Stagehand v4 for supplier workflows, the open-source Browser Use Python library for bounded recovery/exploration, Ollama for local model inference, local Chrome, and SQLite/local evidence storage. No paid browser host or remote model fallback is enabled. The application uses Stagehand rather than introducing Playwright as its automation layer.

Stagehand's current custom-model interface uses a client-side LLM callback; implement an adapter to the local Ollama server that respects Stagehand's message and structured-output contracts. Browser Use documents ChatOllama. Model compatibility, schema conformance, latency, and memory use must be tested before selecting a model. Previously observed machine resources: Apple Silicon with 18 GiB RAM; Ollama and several models are already installed. Start with one loaded model and one active supplier workflow.

Use an application-owned Chrome process with a dedicated persistent profile and loopback-only CDP endpoint. Both frameworks document CDP attachment, but their combined lifecycle is not yet tested. A coordinator grants exclusive browser control to one framework at a time. Stagehand handles the normal procedure; on a bounded handoff, Browser Use gets the current page and a narrow recovery objective. Before returning control, the coordinator reacquires a fresh page snapshot and validates account, branch, URL, and intended outcome. Do not share cached element handles or assume either framework's done flag establishes success. The application owns browser shutdown.

First prove Stagehand-to-Ollama structured extraction, then Browser Use-to-Ollama action schema correctness, then same-browser handoff on a local fixture. Only after those checks should the York supplier workflow depend on the combination. Browser Use remains part of the selected design but is invoked when useful rather than doubling every browser operation. Local Stagehand has no Browserbase managed caching or Model Gateway; use explicit application caching for reviewed navigation knowledge and static reference data, with fresh price/stock observations.

Current references: [Stagehand custom models](https://docs.stagehand.dev/v4/configuration/models), [Stagehand local/CDP browsers](https://docs.stagehand.dev/v4/configuration/browser), [Browser Use Ollama support](https://docs.browser-use.com/open-source/supported-models), [Browser Use CDP attachment](https://docs.browser-use.com/open-source/customize/browser/remote).

Earlier hosted-browser research remains in `BROWSER_AUTOMATION_RESEARCH.md` for future deployment evaluation. It is not the selected local demo configuration. Stagehand v4 uses CDP directly; its Playwright-style APIs should not be confused with a Playwright dependency.

Use an API service, durable background workers, a relational database, and object storage for uploaded images, guide files, and evidence. Supplier browser work should run in isolated session contexts outside frontend request lifetimes. Each supplier adapter should expose a common contract and preserve supplier-specific evidence. Select the language, framework, hosting, and job runtime after inspecting Collin's existing code and proving the supplier runtime requirements.

Use AI where extraction or interpretation is helpful. Code must enforce workflow state, permissions, quantities, comparison math, tenant access, retries, and side effects. An AI judgment alone must not establish part compatibility or current stock.

Core records: shops/users, supplier connections, sourcing requests and line items, equipment identities, guide versions and applicability, verified parts/specifications, supplier identifier mappings, search attempts, offers and branch inventory snapshots, branch locations, permission decisions, selections, and quotes.

Define and version the frontend contract during Milestone 0. Proposed resource groups:

- Supplier connections: connection state, authorized connection/reconnection, and disconnect.
- Sourcing requests: create, read progress and partial results, submit clarification, grant or deny alternatives, cancel, and refresh.
- Selections and quotes: save per-line selections, create/update quotes, and export.
- Email: explicit recipient and send request with deduplication and delivery outcome.

Search creation should return a durable request ID promptly. Collin can poll initially; add server events if his frontend benefits from them. Provide documented job and per-line states, such as queued, running, needs input, needs alternatives permission, completed, partially completed, failed, and cancelled. Completed means processing finished, not that every part was found.

Each offer should include identity and match type, evidence, observed time, supplier/account/branch context, price and currency, purchase unit and pack size, requested-quantity cost, product condition, local quantity, pickup readiness, shipping/arrival information, branch location, and freshness. Unknown values stay null with a reason. Unverified candidates remain separate from eligible ranked offers.

Supersessions need explicit provenance and installation caveats. Whether verified OEM supersessions are included automatically or require the alternatives permission is an open product decision.

## Reliability and acceptance criteria

- Keep shops' accounts, sessions, prices, and private guide access isolated. Protect session material and redact it from logs and evidence.
- Preserve the input, search attempts, decision reasons, and source observations so a bad result can be diagnosed.
- Distinguish expired login, site challenge, timeout, unsupported supplier, no search match, verified not carried, zero stock, and unknown availability. A failed adapter must not report no stock.
- Bound retries, concurrency, elapsed time, and cost. Preserve partial results and provide actionable reconnect or clarification states.
- Cache guide and branch data with provenance and revalidation. Recheck volatile price/stock according to an agreed freshness policy and before relying on stale selections.
- Compare prices on the same quantity and purchase-unit basis. Show when shipping, tax, minimum order, or other charges are unavailable; do not claim an unsupported landed-cost winner.
- Rank closest only among verified matching pickup offers with sufficient stock. Agree whether proximity means straight-line distance or travel time. Do not infer fastest arrival from a ships-today label alone.
- Test ambiguous models, wrong-number collisions, supplier aliases, rejected specifications, supersessions, missing quantities, pack conversions, expired sessions, supplier outages, worker restart, duplicate submissions, stale evidence, and alternatives refusal.
- Benchmark identity precision separately from price coverage, stock coverage, immediate pickup coverage, supplier execution success, latency, and cost. Define thresholds with Collin; no success percentage is established by the current workbook alone.
- Deliver an authenticated staging URL, versioned API schema, example requests/responses and error cases, frontend integration examples, setup/run instructions, migrations, configuration guidance, monitoring, and a known-limitations list. Demonstrate from Collin's frontend before calling the handoff complete.

## Decisions needed before implementation

1. Where is the existing app and reusable quote/export code, and what frontend/authentication stack does Collin use?
2. Confirm the account location and requested quantities for the York pilot. The October 14 email establishes Johnstone and Parts Town as the initial authenticated suppliers, with public Grainger included.
3. How will the deployed backend obtain and renew authorized supplier sessions, including MFA and any sessions that currently exist only on Collin's device?
4. Which benchmark cases and success thresholds define the paid MVP, and does the Method tab's 10% stop rule still apply?
5. Are OEM supersessions automatically allowed? What evidence and user confirmation are required for specification-based alternatives?
6. Does cheapest mean displayed material cost or landed cost? Does fastest mean dispatch or arrival? Does closest mean straight-line distance or driving time?
7. What quote formula is intended: markup on cost or gross margin? How should labor, tax, shipping, and missing prices behave?

These decisions refine the plan. No supplier credentials, live portal automation, emails, or implementation changes were performed during this review.
