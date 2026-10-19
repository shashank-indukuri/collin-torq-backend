# Supplier coverage validation — 2026-10-17

Latest hardening and broader regression evidence: [STEP5_STRESS_VALIDATION.md](STEP5_STRESS_VALIDATION.md). Earlier counts and observations below are historical validation snapshots.

Scope: exact-number catalog queries for Collin’s reviewed test-model guide identifiers, through Johnstone, Parts Town and Grainger. This measures whether each query yields an evidence-backed match or an explicit query no-match, without a browser/extraction error. It does not measure stock availability, alternatives, installed compatibility, or the rest of the application workflow.

## Changes

- Added query-specific Grainger no-results recognition. The requested URL query, document title and visible suggested-results heading must agree. Unrelated recommendations no longer trigger a four-minute Browser Use attempt.
- Added deterministic Johnstone and Grainger main-product parsers. Product recommendations cannot supply the main product’s identity, price or stock. The Stagehand/local-model extraction fallback remains available for other layouts.
- Added a narrow Johnstone Source 1 → York service-brand identity rule. It requires the exact same S1 identifier with eleven digits. It does not accept another manufacturer, another supplier, a different number, or an alternative. Supplier branding is preserved, and `identityEvidence` records the relationship and primary-source URL in the API and console.
- Primary relationship evidence: [Johnson Controls residential/light-commercial parts](https://www.johnsoncontrols.com/Services-and-Support/Replacement-Parts-and-Supplies/Residential-and-Light-Commercial-Parts), [Source 1](https://www.source1parts.com/). Source 1 supplies genuine York service parts; this identity rule is not evidence of installed compatibility or supersession.
- Added a repeatable API/browser/evidence acceptance command: `npm run acceptance:supplier-coverage`. It reads the two historical identifiers from the reviewed capture and defaults to two fresh rounds against the running local backend. Optional arguments are the capture-parent ID and a round count from 1 to 5.

## Live expectations

| Requested guide identifier | Johnstone | Parts Town | Grainger |
| --- | --- | --- | --- |
| Board S1-33101975102 | Found, authenticated, listed as Source 1 | Found, authenticated, listed as York | Found, public, listed as YORK |
| Capacitor S1-02425893000 | Exact-query no-match | Exact-query no-match | Exact-query no-match; suggestions excluded |

Every acceptance round checks all six outcomes, rejects any supplier error, checks exact identifiers and authentication for Johnstone/Parts Town, and fetches every screenshot through the backend evidence route. Quotes, cart and ordering actions are not exercised.

## Limits that remain

- A catalog query no-match does not mean the supplier has no compatible replacement. The guide’s capacitor voltage is unknown; alternatives require specification and replacement evidence before compatibility can be established.
- Branch quantities, pickup readiness, branch coordinates and shipping arrival remain unverified. Offers remain excluded from sourcing rankings.
- Displayed price is not a binding quote. Johnstone’s parser retains an unambiguous displayed price but leaves currency/unit/condition unknown; Grainger’s parser leaves price unknown rather than borrowing a recommendation’s price.
- Johnstone login at Alexandria #461 succeeds, but this test environment requires reconnecting after a cold backend/Chrome restart despite the remember checkbox. No password is persisted for automatic login. Parts Town retained its session across these restarts. Expired sessions return authentication errors, never no-match or zero stock.
- Repeated passes on these two part numbers cannot establish universal 100% reliability across suppliers, page changes, accounts or models.


## Final verification results

- All **73 offline regression tests passed**; TypeScript and console JavaScript syntax checks passed.
- The final adapter version passed **12/12 exact-query checks across two fresh rounds**, with screenshot retrieval verified for every check. Jobs: `41afb960-a5bf-4d0a-8cb2-6fc491047645`, `480a3f1e-7d53-4921-b8ae-961555200792`.
- The original captured child request `8d6a564e-3456-4d01-a494-9e64654d538c` also passed all six checks, retained its parent capture reference, and was verified in the local console. That makes **18/18 successful query outcomes** on the final code. Earlier development runs are excluded from this count.
- Current process model usage remained **zero calls** for these final runs. Stagehand/Chrome performed navigation and DOM reads; the known page formats were handled deterministically. Browser Use/local Qwen remains the tested fallback rather than a required cost/latency on each query.
- Requests ended in **needs_permission**, not partial: the exact search phase finished without supplier errors, and the unresolved capacitor requires a separate verified alternatives step. This state is expected.
- Round durations were about 18 seconds and 37 seconds; the latter includes queueing behind the original captured request. This is an observed local test, not a latency guarantee.

The 18/18 result means 100% of these tested exact-query operations resolved correctly. It does **not** mean all parts were available, that alternatives were verified, or that arbitrary future supplier requests are 100% reliable.
