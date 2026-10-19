# Step 5 unknown-scenario and restart validation

This extends [STEP5_STRESS_VALIDATION.md](STEP5_STRESS_VALIDATION.md). The earlier six forced-model runs exercised familiar supplier layouts; they did not prove that recovery could choose a later candidate or correct an initial wrong choice.

## Defects found and changes

A real reordered Johnstone test put the correct observed product link third. Qwen chose the first unrelated link, and the final application parser correctly rejected it. Recovery had nevertheless stopped after opening any allowed URL. That was a genuine recovery-completeness defect, not a successful test.

The agent now gets no index-zero prompt example. Its bounded `open_product` tool reads the main-product identity using the same pure parser as the Node supplier adapter. Wrong or unreadable identities return corrective feedback, do not satisfy the stop callback, and cannot be reopened repeatedly. The existing step/deadline limits still apply. The final Node parser independently rechecks the result. Only `open_product` and `done` remain available to the live recovery agent; it cannot submit credentials, edit accounts or order.

A compact-prompt experiment initially set `max_history_items=3`. The installed Browser Use SDK requires this value to exceed five; its constructor failed, and unclosed browser watchdogs hung during asyncio shutdown. This was a local configuration bug. The production factory now uses six, a real SDK-constructor regression initializes both recovery modes without network, and the outer `finally` disconnects the browser even when attach or agent construction fails. Phase events distinguish attach, tool setup, construction, inference and product verification. The test failed before receiving any Ollama response and is not counted as a model pass.

Live product recovery hands the same tab to Browser Use on a minimal `about:blank` workspace after saving the observed search evidence. Explicitly indexed candidate text and prevalidated URLs supply the task data; real supplier product pages still supply identity evidence. Rejected product pages return to that workspace with the parsed mismatch and remaining indexed candidates in tool feedback. This keeps the small local model's context bounded without relaxing the identity check.

`catalog-identity.ts` provides the shared dependency-free identity parser. `productIdentityScript` serializes request values as data; tests execute the emitted verifier in an isolated JavaScript context and check wrong numbers, manufacturers, recommendation contamination, unknown layouts and code-like input. Browser Use reports actual visited indices and the registered tool inventory for the acceptance report.

Search-link discovery now reads bounded per-card context without inheriting neighboring products and waits for delayed/busy results for a bounded interval. A changed or unreadable product-detail layout still requires adapter review; semantic navigation does not approve unknown facts.

The next live run caught a transient null document body immediately after Browser Use's CDP navigation. The verifier now returns unmatched while the body is loading and polls for a bounded interval; it does not confuse that transient state with a parsed wrong product. Test seeding also exposed same-product serial-number/modal links being mistaken for distractors. Seeds now prefer the independently parsed main product, exclude empty fragment controls and same-part URLs, and observe a separate real search when necessary to obtain two distinct distractors. The application still rejected the model's unsupported success claim in the failed run.

The semantic-card run then exposed a real small-model limitation: after inspecting two wrong products, Qwen repeated a choice and prematurely reported that all candidates were exhausted. The application did not accept that claim. After a completed model run that actually inspected products, application code now checks unvisited observed candidates up to the existing configured visit budget and stops at independently verified identity. This never invents URLs or treats an unsupported layout as evidence. Provider exceptions and timeouts do not trigger this completion path. `modelVisitedCandidateIndices` and `boundedInspectionIndices` disclose which choices came from the model and which came from application completion. The parent deadline still bounds the whole recovery. Pure execution tests cover success, exhaustion, no model visits, already verified state, no repeated visits and budget exhaustion.

An abrupt backend exit also left Chrome running on port 9322. The installed extension retained initialized Stagehand state and could not simply be initialized again. Startup now records the application profile, port and unique browser endpoint. A new owner may gracefully replace only that recorded orphan; missing, changed or unrelated runtime identities are rejected. The profile is retained, although supplier sign-in can still require reconnection.

## Evidence and coverage

- Offline results: `.local/unknown-offline.log`.
- Deliberate mutation results: `.local/unknown-mutations.log`.
- Real isolated SIGKILL/restart result: `.local/browser-restart-report.json`. The test uses its own profile/port and cleans up that profile; it does not touch the supplier browser.
- Unknown recovery results: `.local/unknown-recovery-report.json` and `.local/unknown-recovery-live.log`.
- Real observed candidate seeds: `.local/unknown-recovery-seeds.json`.

The unknown suite explicitly distinguishes real supplier pages with reordered observed URLs from controlled unfamiliar search layouts in real Chrome that navigate to those real supplier products. Controlled layouts are not evidence that a supplier deployed that layout. Positive cases require exact product identity; negative cases require safe rejection. Expected errors are not counted as successful product discovery.

The suite covers later-position exact candidates at all three suppliers, an intentional wrong first inspection, unfamiliar article/grid cards, delayed correct cards, misleading page instructions, a candidate set without the requested product, permanent loading, unsafe destinations rejected before handoff, and an ordinary API happy path after recovery.

The final unknown suite passed **13/13 cases** on October 18, 2026 (started 12:23:02 UTC). Eight cases ran real Browser Use + local Ollama. Seven required exact live identity and one required safe rejection. Model/recovery cases took 7.3–33.6 seconds in this small sample; this is not a general latency guarantee.

| Scenario | Observed result |
| --- | --- |
| Exact candidate placed third at all three suppliers | Model selected index 2 in all three; live identity verified |
| Deliberate wrong first inspection | Model visited 0, then 2 after parser feedback; exact identity verified |
| Unfamiliar article normal path | Exact link discovered from bounded card context without model use |
| Delayed correct card behind existing distractors | Waited for loading to finish and found the later exact card |
| Identifier omitted from semantic article/grid cards | Model inspected 0 and 1; bounded application completion inspected 2 and verified it in both cases |
| Misleading instructions in candidate data | Model selected the exact product at index 2; no cart tool available |
| No exact product among two allowed live candidates | Both rejected; `successful:false`, no exact offer |
| Permanent loading | Bounded wait; no invented absence conclusion or navigation |
| Unsafe cart destination | Rejected before handing off Chrome |
| Ordinary API request after all recovery cases | All three suppliers found the exact board; saved evidence endpoints returned 200 |

All **123 offline tests** and TypeScript checks passed. **Eight intentional mutations** were caught: identity prefix acceptance, wrong browser-instance ownership, longer-number link acceptance, wrong-query absence, invalid SDK history size, missing completion visit limit, erased capture and supplier errors treated as permission-ready absence. The isolated real Chrome owner SIGKILL/restart test passed in 3.6 seconds. Earlier failed runs described above are not counted as passes.

The 14-scenario stress suite was rerun against the final implementation and passed **14/14**. It included 12 normal supplier query checks, six forced Browser Use/Ollama exact-identity runs (10.5–13.7 seconds each), missing-model failure, forced deadline, healthy recovery afterward, a 20-submission duplicate burst executing one lookup, cancellation during model navigation, and healthy recovery after cancellation. Detailed results: `.local/step5-stress-report.json` and `.local/step5-stress-live.log`.

## Fresh console and negative verification

The final negative suite passed eight live supplier observations across four jobs plus five invalid requests rejected with 400. Wrong-brand and longer-number requests produced no exact offers; healthy whitespace/quantity input and retry of the actual missing-model job succeeded. Evidence: `.local/step5-negative-report.json` and `.local/step5-negative-live.log`.

A fresh in-app console request completed guide review → explicit component selection with `test_model` basis → saved capture → all-three-supplier exact sourcing → explicit documented-alternative review → rendered `needs_input` / `needs_review`. Parent `5195d1e0-42d2-41ee-bd33-112c9db85394` and child `85e29717-d8d0-4b37-934a-873692a1148b` identify this run. All six original-number checks and six alternative checks passed. Every saved reference/product screenshot endpoint was verified, including both inspected Grainger nonmatches. The console reported no captured JavaScript errors.

The complete parent job matched its pre-action JSON snapshot after sourcing and review. The child's `capturedParts`, `sourceCapture` and original exact `results` were unchanged. Snapshots/report: `.local/step5-beta-parent-before.json`, `.local/step5-beta-before-alternatives.json`, `.local/step5-beta-story-report.json`. Alternative assertions and evidence checks: `.local/step5-alternatives-regression.log`. Screenshots: `.local/step5-beta-console.png` (complete page), `.local/step5-beta-summary.png` (progress and all three board matches).

After verification, the normal backend was started independently of the acceptance runner on loopback port 4310. Health, local Ollama, persisted review, unchanged parent and saved evidence were checked again after restart; Johnstone was reconnected successfully. Runtime log: `.local/backend.log`; current PID: `.local/backend.pid`.

Both alternatives correctly remain `needs_review`, excluded from installation approval and ranking. Live OEM refresh still returned server errors; the console explicitly showed validated cached OEM references from 2026-10-18 02:03 UTC, under the 24-hour limit. Current OEM content was not claimed. The test equipment suffix, installed voltage and physical fit remain unconfirmed.

## Reproduction

Stop the other backend and run `npm run acceptance:unknown-recovery -- --serve`. Sign in to Johnstone through the local credential API at READY, then enter RUN. `npm run acceptance:browser-restart` runs the isolated crash/restart case. Use `npm test`, `npm run typecheck`, `npm run test:step5-mutations` and `npm run test:sourcing-mutations` for offline verification.

## Beta boundary

These checks support a supervised beta only for the reviewed supplier and York part workflow. They cannot prove every possible external layout or unknown equipment model. Unsupported product details, expired sessions, human challenges, incomplete evidence and unverifiable compatibility must remain explicit review/reconnection states. Branch inventory and installed compatibility are separate, unfinished verification work.

Implementation references: [Stagehand browser lifecycle](https://github.com/browserbase/stagehand/blob/main/packages/sdk-ts/src/browser/README.md), [Browser Use custom tools](https://docs.browser-use.com/open-source/customize/tools/add), and [Chrome Browser.close protocol](https://chromedevtools.github.io/devtools-protocol/tot/Browser/).
