# End-to-end and missed-branch validation — October 18, 2026

**Workflow execution: passed. Complete commercial outcome: not passed. Beta readiness: not established.**

The fresh live journey began at 8:03 PM EDT on October 18. It used the actual guided HTML, API, durable SQLite jobs, cached real guide PDF, configured supplier accounts and live supplier pages. No cart, purchase or email action was performed.

## Live guided journey

Report: `.local/guided-live-e2e.json`. Browser capture: `.local/guided-live-e2e.png`.

| Phase | Result |
|---|---|
| Equipment prefix → full-model clarification | Passed; no model suffix was silently assumed. |
| Real cached guide → component review → capture | Passed; test-model basis and unknown capacitor voltage preserved. Capture `74a89e17-2ac4-4154-9e88-4e251e30910b`. |
| Captured numbers → six exact supplier checks | Passed; all three suppliers found the board; all three exact checks returned no match for the historical capacitor. Source `b2f8d829-5f26-4ad5-85f8-ddf28dea1885`. No alternatives ran automatically. |
| Fresh comparison → six refreshed supplier checks | Processing passed. Comparison remained `needs_verification`; cheapest/closest had no eligible winners. Grainger provided an arrival winner for the board. |
| Explicit UI alternatives consent → six candidate checks | Passed. Three reference snapshots and two documented capacitor candidates were reviewed. Original exact results and capture remained unchanged. |
| Candidate review in guided UI | Passed. `S1-02425893700` had Johnstone and Parts Town offers; `S1-CAP4405040DR` had a Parts Town offer. Both remained `needs_review`, with ranking eligibility false. |
| Actual API/browser shutdown → restart → persisted responses/evidence | Passed. Capture, original offers and review survived. Twenty saved evidence files/reference resources were checked in the final reviewed request. |

Reviewed request: `d713547e-83a1-40e1-9d70-14ee48c2d81e`.

[Open the reviewed result](http://127.0.0.1:4310/flow?job=d713547e-83a1-40e1-9d70-14ee48c2d81e). Evidence expires for rankings after 15 minutes; the UI now provides a refresh action against the original sourcing request.

This guided journey used **the active legacy supplier engine** with Luna configured. It does not prove the experimental goal engine is ready to replace every supplier path. Separate agent and recovery checks are listed below. Every newly executed job now stores the configured provider/model/engine and execution start time; this metadata does not imply a model was invoked.

## Missed branches fixed

1. **Expired sessions during alternative review:** review previously bypassed exact sourcing's automatic-login wrapper. Both now share one bounded login/retry path per supplier. Cancellation during credential lookup prevents login and further supplier operations. Credentials are cleared after use.
2. **Agent no-match without a repeated part number:** an explicit “No results” message can now be bound to the actual query URL. A wrong query, a neighboring/prefix identifier, absent literal evidence, login and challenge pages cannot establish this outcome. The real-browser fixture passed.
3. **Branch evidence reduced to bare numbers:** experimental-agent field extraction now uses the literal rendered page text; navigation remains through Stagehand. Each branch fact must retain its identity alongside the value in the source quote. The live Johnstone check retained `Arbutus - #406\t1`, `Rosedale - #369\t1`, `Easton - #123\t1`, and `Pittston - #704\t1`. Addresses, purchase basis and pickup readiness remain unresolved; these are not nearest-pickup winners. A distribution-center quantity with no verified branch ID remains unranked.
4. **Frontend API contract:** the published `allOf` offer schema rejected real response fields such as supplier, match and evidence because the base schema prohibited extensions. It now permits composition while requiring the extended offer fields. A regression reproduced the original rejection before the fix. The served OpenAPI contract subsequently validated three real persisted responses: capture, sourcing and reviewed comparison.
5. **Expired comparison UI:** the guided UI now has a refresh action that fetches the original source's current snapshot and creates a separate comparison. It does not submit a nested comparison against the comparison child. Old results stay separate.
6. **Resume/review links:** `/flow?job=<id>` opens a specific saved result. Reload can resume that result even without the prior localStorage selection. Starting a new request clears the result URL.

The guided alternatives permission/display path added in the preceding review was exercised live, including the correct `allow: true` API schema. Refusal, incomplete-supplier exclusion, comparison-screen consent and source-bound refresh were also exercised with controlled local browser/API fixtures.

## Verification and scope

| Check | Outcome |
|---|---|
| TypeScript | Passed. |
| Offline regression suite | **166 passed**, including new review reauthentication/cancellation, query binding and API-contract cases. These tests do not claim live model accuracy. |
| Live supplier checks in guided journey | **18 completed**: six source, six refresh, six documented-alternative checks. |
| Real API negative/replay checks | **11 passed**, covering prefix ambiguity, exact/wrong guide suffix, unsupported manufacturer, invalid quantity, stale handoff, premature review, permission bypass, duplicate consent, conflicting replay and nested-comparison rejection. No backend inference ran for these checks. |
| Comparison mutation checks | **7 deliberate bugs caught**: wrong ZIP, stale facts, future pickup as ready stock, infinite stock, expired winners, neighboring-product contamination and wrong Census street. |
| Capture mutation checks | **2 deliberate bugs caught**: changed candidate evidence and cancellation overwritten during revalidation. |
| Experimental Stagehand browser checks | Positive randomized catalog/hidden-stock flow passed; query-bound no-match with no identifier in the visible message passed. |
| Browser Use + Luna unknown-control recovery | Passed; the inventory panel was independently verified open, cart untouched. |
| Guided UI branch checks | Consent, refusal, candidate review, unchanged exact results, failed-supplier exclusion, source-bound comparison refresh and direct-link resume passed, with zero model calls. |
| Live experimental Johnstone agent | Exact board/price and four branch-bound numeric stock observations captured; commercial completion still failed. |

One browser check was initially launched while another process owned the profile. The ownership guard blocked it. It was rerun serially and passed; the harness contention is not counted as a product regression pass.

## Remaining failures / unsupported requirements

- Cheapest and nearest ready pickup remain unresolved in the live comparison. The processing pass must not be presented as successful completion of these business categories.
- General stocking-branch address discovery, complete inventory enumeration, purchase-unit/currency context, pickup readiness and equivalent quantity/ZIP-bound delivery interactions across all suppliers remain incomplete.
- The experimental agent is not promoted as the default: its shipping-quantity/date handling and general alternative discovery still lack equivalence with the current working slices.
- The supported replacement review is a limited documented York capacitor case. Missing installed voltage, fit, terminals and complete OEM authority prevent installation approval and ranking. General description/specification query variations remain unsupported.
- General Step 2 discovery doors and additional manufacturer/PDF layouts remain incomplete, as recorded in `WORKFLOW_2_TO_6_AUDIT.md`.
- Ollama's earlier Qwen3.5 consistency gate failed (13/21). Current live inference/recovery checks use the user-selected Luna. Offline tests forced to the Ollama provider do not establish a working local-model browser workflow.

## Reproduction

Stop the normal backend before browser-owning scripts. Do not run them concurrently against the dedicated profile.

```sh
npm run typecheck
MODEL_PROVIDER=ollama npm test
npm run test:comparison-mutations
npm run test:capture-mutations
npm run acceptance:flow-alternatives
npm run acceptance:agent
AGENT_FIXTURE_SCENARIO=no_match npm run acceptance:agent
npm run acceptance:workflow-agent
npm run acceptance:guided-live -- --serve
```

The live journey uses the configured provider and the shared persistent $0.50 estimated app budget. While its server remains available, run `npm run acceptance:journey-negative` and `npm run acceptance:api-contract`. Do not reset the usage ledger to rerun tests. No email to Collin has been sent.
