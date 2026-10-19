# Steps 2–6: requirements and implementation audit

Reviewed October 18, 2026, against [Collin's workflow document](https://docs.google.com/document/d/1yh8dg73yWgO82CpbxLlyAim-DT-GI0AvTkz2DpXsg-A/edit), fetched through Google Drive, and the local `10_07_2026_ Torq Slim Back End User Flow.docx`. Both describe the same core sequence. The Google document was last modified October 16, 2026.

**Conclusion: Steps 2–6 are partially implemented. Complete path coverage and beta readiness have not been established.** Model evaluations and parser regressions do not establish commercial data completeness.

## Why the new result barely changed

The inspected comparison request is `41b0c5e7-b1f7-466f-a5ba-230762ba4a59`, created October 18 at 7:39:48 PM EDT. Its parent exact search is `0b311226-d2d5-4a08-9147-2bf60ef965f2`, and its captured source is `628094cb-3823-46f6-b40c-bf8fe96aed19`.

The running health endpoint reported `provider: openai`, `name: gpt-6-luna`, **`supplierEngine: legacy`**, and zero model calls since backend startup. The offers contain no goal-agent trace. This is a fresh comparison request, not merely an old result being redisplayed. The legacy exact-catalog paths return through deterministic navigation and parsers before model extraction is needed. Changing the configured model cannot add missing interactions to those paths.

Specific implementation defaults explain the visible gaps:

- `src/catalog.ts` sets Johnstone currency, purchase unit, pack size, condition and branch inventory to unknown.
- `src/commercial.ts` reads Johnstone's selected store address but assigns its stock to null. It does not collect the complete Store/Qty inventory table and resolve every stocking branch's address.
- Parts Town has USD, each and shipping quantity 9 in this response, but no destination/quantity-bound arrival quote. Both Johnstone and Parts Town board offers in this request report authenticated access; Grainger is public.
- Grainger has a one-unit arrival estimate for ZIP 22201 and 25 branch records, but no verified immediate pickup winner. Future pickup is not ready-now stock.
- Every observed board condition is null. `compareOffers` requires condition `new`, in addition to price/units/quantity evidence, for a cheapest winner. That condition requirement is an additional application policy; the source document does not explicitly require it.
- The request has `allowAlternatives: false`. The capacitor was searched only under its historical exact number. Six completed exact checks do not establish that an alternative search ran or that six complete commercial offers were obtained.

The input is sufficient for these exact-number checks. Most missing output is explained by implementation and policy gaps. Some fields may genuinely be absent from supplier pages; missing extraction must not be described as supplier absence without checking.

## Coverage matrix

“Limited” means a real supported slice exists, not general coverage. “Missing” means the required workflow is not implemented. Code references identify the active implementation; saved test counts are not used to infer missing capabilities.

| Step | Required path | Current coverage | Evidence / remaining gap |
|---|---|---|---|
| 2 | Search saved guide database first | Limited | `GuideResolver.cached` validates one reviewed York E1RD source with PDF checksum and re-derived text. It is not a general multi-manufacturer guide catalog. |
| 2 | Manufacturer public guide | Missing | Resolver reports `manufacturer_public: not_implemented`. |
| 2 | Shop dealer portal | Missing | Portal not configured; no authenticated guide-discovery adapter. |
| 2 | Signed-in Johnstone Model-to-Part | Missing | Explicitly reported unimplemented. Supplier product login is separate. |
| 2 | Public Parts Town model pages | Missing | Explicitly reported unimplemented. Product lookup does not implement model-guide discovery. |
| 2 | Open-web guide search | Limited | Downloads a single reviewed distributor-mirror URL; it does not perform general guide search. |
| 2 | Honest failure / ask for exact part numbers | Partial | Unsupported/unavailable results remain unresolved. The guided equipment form lacks a dedicated direct-part-number entry path; the API supports exact-number input. |
| 2 | Confirm guide model applicability | Limited | Exact listed model and prefix confirmation work for the reviewed York table. Serial-range applicability, revisions and installed modifications remain unverified. The guide is historical and incomplete, 3 of 4 printed pages. |
| 3 | Find requested part in confirmed guide | Limited | `src/parts.ts` parses the reviewed E1RD column grammar and a small set of component aliases. It is not a general PDF/table/image interpretation engine. |
| 3 | Distinguish ambiguous components / non-applicable rows | Implemented within supported table | Broad control-board requests need confirmation; multiple candidates and `---` rows are handled. Unsupported terminology stays unresolved. |
| 3 | General guide layouts / scanned pages / other families | Missing | No general extraction adapter. Model selection does not change this deterministic parser's scope. |
| 4 | Capture part number, description and specifications | Implemented within supported extraction | Reviewed selections, quantities, source page/model column and immutable captured values are retained. Unstated voltage remains null. |
| 4 | Verify current replacement and installed fit | Incomplete | Capturing a historical identifier does not verify current supersessions or installed compatibility. These limitations remain explicit. |
| 4 | Stale selection / cancellation / source integrity | Implemented and regression-tested | Capture validates the expected guide, snapshot, chosen rows and workflow state. |
| 5 | Exact-number lookup at all three selected suppliers | Limited live coverage | The inspected board has three exact listings. Capacitor checks returned exact-query no-matches. Coverage is tied to known supplier paths and parsers. |
| 5 | Automatic configured supplier login | Partial | Johnstone and Parts Town exact checks have bounded credential login/retry paths. Authentication challenges, rejection and expiry remain separate outcomes. Login helpers still use supplier-specific controls. A public result/no-match can return without forcing authentication, so authenticated search scope is not guaranteed for every outcome. The early alternative-review branch calls supplier lookup outside the exact-search auto-login wrapper; expired sessions in that path need equivalent recovery. |
| 5 | Separate no-match, supplier error and partial completion | Implemented for existing adapters | Attempts have found/no-match/error states. Failed scope must not become a complete no-match conclusion. |
| 5 | Ask permission after unresolved exact checks | Backend present; guided UI omission fixed in this review | The guided UI now exposes explicit documented-alternative review consent, including from a comparison result. Exact-search refusal uses the existing denial endpoint. Failed/incomplete supplier checks do not show a permission-ready no-match prompt. |
| 5 | Search alternatives using captured specifications | Missing generally | Current review supports only the known York capacitor reference chain. Other components return unsupported. |
| 5 | Try different description/specification query variations | Missing generally | No general task-driven query-variation search. A small fixed reference set is not this requirement. |
| 5 | Verify alternative evidence / reject conflicts | Limited | The supported capacitor review retains supplier versus OEM authority, capacitance/voltage conflicts and missing fit evidence. Candidates are not installation-approved or ranked. |
| 5 | Goal-driven Stagehand navigation | Experimental, inactive in guided requests | `SUPPLIER_ENGINE=agent` is an evaluation option. It has dynamic control discovery and source-grounding guards but incomplete supplier commercial/alternative coverage. |
| 5 | Browser Use recovery for unfamiliar workflows | Two different paths | Active legacy recovery mainly selects bounded product candidates. The experimental goal engine has broader read-only control recovery. Both use the selected model, but they expose different capabilities. |
| 6 | Collect comparable purchase price, currency and units | Partial | Supplier-specific fields are missing or default to null. Preserve unknowns, but complete the collection workflows before concluding the pages omit them. |
| 6 | Cheapest | Rule implemented; complete eligible inputs unavailable | Requires explicit new condition, comparable units/USD and sufficient stock. Add a separately qualified observed-price view if useful; do not silently fill currency, condition or units. The intended cheapest policy needs to be aligned with Collin's requirement. |
| 6 | Discover all stocking branch names and quantities | Incomplete | Johnstone selected-store parsing discards other inventory rows. Grainger inspects a bounded displayed branch set. Parts Town shipping stock is not branch stock. |
| 6 | Find branch address on supplier locations page | Missing generally | Comparison geocodes addresses already collected. It does not navigate supplier location pages to resolve unknown branch names. |
| 6 | Fall back to open-web branch address discovery | Missing | No general address-discovery fallback. |
| 6 | Confirm location using Census | Partial | Census address-range interpolation and exact street/ZIP checks exist. They do not prove a real building/entrance as phrased in the document. ZIP 22201 uses an explicitly approximate bundled ZCTA reference. |
| 6 | Geocodio backup | Missing | No configured paid geocoder; not silently enabled. |
| 6 | Cache branch coordinates and measure distance | Implemented for resolved inputs | SQLite address/location cache and straight-line distance exist. Empty branch addresses cannot be resolved by the current path. |
| 6 | Closest branch among sufficient in-stock options | Ranking rule implemented; collection incomplete | Current policy additionally requires ready pickup and sufficient quantity for the purchase unit. It cannot produce a reliable winner from missing inventory/location inputs. |
| 6 | Fastest shipping | Partial | This request has a Grainger destination/quantity-bound arrival estimate. Equivalent full interaction paths are absent for Johnstone and Parts Town. |
| 6 | Freshness / refresh / partial-result isolation | Implemented | Separate comparison jobs preserve the source, refresh volatile observations and expire ranking evidence after 15 minutes. Completion does not imply a winner in every category. |
| 6 | Rank approved alternatives alongside exact parts | Missing | Current comparison refresh is exact-only; alternative candidates remain excluded. No general alternative approval path establishes ranking eligibility. |

## Why simply enabling the new engine is insufficient

The experimental goal engine improves navigation, but `src/sourcing-agent.ts` currently sets shipping `quantityConfirmed: false`, accepts arrival-date grounding only when an ISO date is printed, and rejects its generic alternative-search mode pending documented replacement evidence. Blind activation would risk losing the working Grainger delivery comparison while still leaving alternatives incomplete. Promote it only after equivalent complete supplier tasks pass through the actual API and guided UI.

## Concrete change made during this audit

`public/flow.html` now renders the documented-alternative consent and review path. A user can explicitly authorize review after complete exact-query no-matches, see candidate specifications and replacement-reference links, and inspect missing compatibility checks. Original exact offers stay separate. On exact sourcing results, declining ends that search without starting alternatives. The comparison screen can also expose the explicit review action instead of swallowing the permission path.

This exposes the **existing limited capacitor review**; it does not implement general alternative discovery. No consented supplier search was initiated against the user's saved job during the audit.

The Stagehand browser acceptance uses local API fixtures and the real backend request schema. It verifies: no automatic review on render, explicit consent, refusal, candidate display, missing-voltage warnings, unchanged exact results, exclusion after a supplier error, and the comparison-screen action. It made zero model calls. Run with the backend stopped: `npm run acceptance:flow-alternatives`. The 162-test offline regression suite also passed; its scope remains distinct from live supplier completeness.

## Execution priorities and acceptance gates

1. **Finish one complete authenticated supplier task.** Use the same board, quantity one, ZIP 22201 and configured Johnstone account. Have the agent expose available price/unit context, enumerate displayed inventory rows and resolve stocking branches from supplier locations pages. Validate each stock count with branch-bound evidence. An unknown field must explain whether it was absent, inaccessible, unsupported, or failed.
2. **Complete Parts Town and preserve Grainger delivery.** Confirm sign-in when required, bind quotes to quantity/ZIP, normalize purchase units, retain shipping versus branch inventory and actual arrival estimates. Require repeatable runs through the API, not only a direct agent script.
3. **Implement general consented alternatives.** Use captured verified specifications and controlled description variations, discover current replacement evidence dynamically, separate documented supersessions from merely comparable candidates, and stop on missing critical ratings/conflicts. Preserve consent, original identifiers and exact results.
4. **Complete Step 6 location discovery.** Resolve branch names via supplier pages, use a reviewed web fallback, cache addresses/coordinates with provenance, and calculate nearest among sufficient eligible stock. Clarify Census interpolation versus building verification and the optional paid fallback before claiming the document's whole process.
5. **Generalize Steps 2–3.** Implement the discovery doors in order with model applicability and reliable part extraction across additional guide families. Keep the reviewed York cache as a tested case, not a claim of general coverage.
6. **Promote only after an end-to-end coverage gate.** Run found, no-match, alternatives granted/declined, missing specifications, expired login, site challenge, unavailable branch address, insufficient quantity, packs, stale evidence, cancellation and restart scenarios. Record field completeness, actual agent execution, source evidence, latency and cost. Passing isolated model prompts is not this gate.

Steps 7–8 selection, quote math, export and email are outside this requested audit. No email has been sent.
