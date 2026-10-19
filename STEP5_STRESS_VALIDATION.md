> This records the earlier October 17 run. The October 18 unknown-layout, shared-identity and crash/restart changes and current rerun outcomes are documented in [STEP5_UNKNOWN_VALIDATION.md](STEP5_UNKNOWN_VALIDATION.md).

# Step 5 stress validation — October 17, 2026 (Eastern)

The tested story is reviewed part capture → exact supplier search → documented alternative review → durable job and evidence → console rendering. This report covers the local pilot, with Stagehand 4.2.1, Browser Use 0.13.11, Ollama qwen3:4b and the dedicated Chrome profile. There is no paid model fallback.

## Fixes exposed by regression work

- Recovery waits for its Python child to close before Stagehand reconnects. Timeouts and excessive output kill and reap the child; malformed, ambiguous and incorrectly typed result markers fail closed. Browser Use's legitimate null completion flag after an application stop callback is accepted; it cannot override the independent navigation result.
- The dedicated browser reuses one sourcing tab. Before Browser Use connects, other application tabs close while the original target remains. This avoids applying a single-supplier domain watchdog to unrelated existing supplier/reference tabs. Evidence remains on disk. Reference-reading tabs close after their snapshots are saved.
- Product-link selection requires complete identifiers, so a longer number with a matching prefix cannot win. Recovery URLs reject unexpected ports, fragments and extra action subpaths.
- Exact-match facts require the reviewed main-product parser on a supported product URL, including after model navigation. An LLM cannot establish exact identity using scattered page text or recommendations. Unknown layouts return a reviewable error.
- Search no-match outcomes require the exact supplier search URL/query and an absence heading or the reviewed Johnstone paragraph quoting that exact number before popular products. Product-page empty widgets cannot establish query absence.
- Product detail fields receive a bounded load wait. Johnstone authentication is rechecked after product navigation.
- Alternative failure records retain Browser Use recovery evidence. Reported 440 VAC rejects the 370 VAC candidate before any supplier lookup, while the 440 VAC candidate remains subject to the other compatibility checks.

The first stricter no-match run exposed Johnstone's paragraph layout. A subsequent forced-model run exposed the legitimate null completion flag. Both were corrected with dedicated regression cases; these failures are not counted as passes.

## Offline regression evidence

111 tests passed, plus TypeScript checks. Added cases include child-process timeout/exit/output handling, twelve queued jobs producing 72 serialized lookups, duplicate enqueues, restart of interrupted jobs, cancellation before and during work, seven supplier-failure classes, exact-identifier collisions, misplaced no-match text, and alternative voltage/recovery failures.

Four intentional source mutations were rejected by assertions: longer identifiers accepted as exact, wrong-query absence accepted, original capture erased, and supplier errors converted to permission-ready absence. Logs: `.local/step5-stress-tests.log` and `.local/step5-new-mutations.log`.

## Live evidence

Before hardening, three real rounds passed 18/18 original-number checks across Johnstone, Parts Town and Grainger. After hardening, two further normal rounds passed 12/12 checks: board S1-33101975102 found at each supplier, original capacitor S1-02425893000 returned query-specific no-match at each. Each attempt's saved screenshot was retrieved through the API.

The final live suite passed **14/14 scenarios**, with detailed results in `.local/step5-stress-report.json`, per-job snapshots in `.local/step5-stress-job-<id>.json`, and runtime logs in `.local/step5-stress-live.log`.

| Live scenario | Result |
| --- | --- |
| Two normal supplier rounds | 12/12 exact/absence query checks passed |
| Forced Browser Use + Ollama at each supplier, twice | 6/6 passed; original tab restored and exact identity independently verified |
| Missing Ollama model | Error retained; no offer or no-match invented |
| Forced recovery deadline | Child terminated; error retained; browser ownership recovered |
| Normal search after recovery failures | Passed |
| Twenty concurrent identical API submissions | One job, one supplier lookup |
| Cancel during live model navigation | Cancelled state retained; no subsequent supplier started |
| Normal search after cancellation | Passed |

The six successful model runs took 19.8–37.2 seconds, including navigation, process startup and evidence retrieval. This small repeated sample is not a general latency or success-rate guarantee.

A separate real negative suite passed eight supplier observations across four jobs: Carrier requests for the York board produced three identity errors and no offers; the longer number S1-33101975102A produced no exact offer at any supplier (Johnstone/Parts Town explicit no-match, Grainger identity error); whitespace and quantity input succeeded at Parts Town; and the actual missing-model job succeeded through the retry API with old error results replaced, not duplicated. Five invalid API requests returned 400. Evidence is in `.local/step5-negative-report.json` and `.local/step5-negative-live.log`.

The final alternatives regression also passed: two candidates, all six supplier checks, all three saved reference snapshots and every evidence endpoint. Original exact results and captured parts remained unchanged. OEM references were explicitly cached after live server errors; current OEM content was not claimed. See `.local/step5-alternatives-regression.log` and `.local/alternatives-live.json`.

The in-app console was verified from capture/source handoff through live progress to the final `needs_input` / `needs_review` state. It displayed both candidates, the missing installation checks, cached-source warnings and the complete two-product Grainger inspection. Screenshot: `.local/step5-stress-console.png`. The backend remains on loopback 4310 with test forcing disabled.

## Reproduction

Run `npm test`, `npm run typecheck`, `npm run test:step5-mutations` and `npm run test:sourcing-mutations` for offline checks.

For the live suite, stop the other backend, then run `npm run acceptance:step5-stress -- --serve`. It owns port 4310 and the dedicated browser. At its READY prompt, authenticate the supplier accounts through the local credential API or console, then enter RUN. Credentials must not be placed in source, test fixtures or log files. `--serve` leaves the normal backend available after the suite and disables the process-local forcing flag. No HTTP request can enable forced recovery. After that suite, run `npm run acceptance:step5-negative` against the idle backend for wrong-brand/prefix, healthy-input, actual-retry and invalid-request checks.

## Beta scope

These checks support a supervised beta of this explicitly supported catalog-and-review flow. They do not justify an unrestricted beta promising arbitrary model resolution, verified installed alternatives, or local-stock sourcing.

These are exact catalog observations and documented alternative candidates for the supported York pilot. They do not establish branch stock, pickup readiness, account pricing, equipment suffix confirmation or installed replacement compatibility. Alternative candidates remain excluded from ranking and installation approval. The OEM original-to-replacement link, installed voltage and physical fit still need verification; dated cached OEM references remain visibly labelled during source outages.

Supplier websites can change, expire sessions or present human challenges. Such cases must remain errors/reconnection requests rather than invented matches or no-stock conclusions. The pilot does not yet establish broad manufacturer, component or supplier-layout coverage.

## Current references used for the handoff review

[Browser Use browser parameters](https://docs.browser-use.com/open-source/customize/browser/all-parameters), [Browser Use tools](https://docs.browser-use.com/open-source/customize/tools/basics), [Stagehand v4 browser lifecycle](https://github.com/browserbase/stagehand/blob/main/packages/sdk-ts/src/browser/README.md), and [upstream CDP hang report](https://github.com/browser-use/browser-use/issues/4579). The upstream issue is supporting context, not proof that every local stall has that exact cause; the local failures and corrected behavior are captured in the tests above.
