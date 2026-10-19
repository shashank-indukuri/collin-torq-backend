# Step 6 — evidence-based comparison pilot

Implemented October 18, 2026. This is a working local comparison slice for the reviewed York flow, with explicit gaps where supplier data cannot establish a winner. It does not claim complete verified price/branch-stock coverage.

## Behavior and contract

`POST /api/searches/{sourceJobId}/compare`

```json
{
  "expectedUpdatedAt": "<source job updatedAt>",
  "requestId": "<one UUID per refresh, reused when retrying that refresh>",
  "origin": {"address": "Arlington, VA 22201"}
}
```

`origin` defaults to the source request. It also accepts explicit user coordinates as `{address, coordinates:{latitude,longitude}}`. Coordinates are range checked and labelled user supplied; address correspondence is not independently verified. Unknown request fields, client-supplied offers, prices and inventory are rejected. A changed source timestamp returns 409. Identical refresh requests reuse one child; a new `requestId` creates a new refresh. The source job, capture and alternative review remain unchanged. To refresh a comparison child, use its `comparisonOf.jobId` as the source.

The child refreshes exact-number queries and commercial evidence across the selected suppliers. Step 6 never starts generic alternative searches. Unapproved alternative candidates remain outside the comparison. Direct verified-number requests can also use `stopAfter:"comparison"`.

Frontend output is `job.comparison`, particularly `comparison.lines[].rankings`. The legacy `results[].rankings` is not the Step 6 comparison contract. Each category has a basis, zero or more tied winners, source screenshots, exclusions and scope limitations. Overall `needs_input` / `comparison.status:needs_verification` is expected when categories lack evidence; it is not converted to a fabricated complete result.

| Category | Required proof |
| --- | --- |
| Cheapest | Exact non-synthetic identity, USD price, known purchase unit/pack, new condition, sufficient verified pickup or shipping quantity. Integer cents and full-pack rounding; excludes tax/freight. |
| Closest | Exact identity, normalized purchase/inventory units, sufficient branch quantity, ready-now pickup, resolved branch and origin coordinates. Straight-line miles, with an approximation label for a ZIP-area origin. No company-wide stock or future pickup substitution. |
| Fastest shipping | Exact identity, a future calendar arrival estimate, destination ZIP agreement, and a quantity-bound quote. Dispatch text is insufficient. The reviewed Grainger adapter currently verifies only the default quantity of one; changed quantities remain unresolved. Timing does not verify condition or installed compatibility. |

Commercial evidence expires for ranking after 15 minutes. `comparison.expiresAt` is explicit. GET projections clear all expired winners and request a refresh without overwriting the saved historical job. Branch addresses/coordinates are cached separately in SQLite for up to 30 days; product stock is never cached as branch-directory metadata. Address changes invalidate reuse. Geocoding is bounded and independent of serialized browser actions; cancellation stops subsequent branch work.

## Live findings

- Parts Town: York S1-33101975102 showed USD 198.49 per each and 9 available for shipping from Parts Town. This is not local branch stock. Condition and a destination-specific arrival date were not established, so no cheapest-source or fastest-delivery claim was made for this listing.
- Grainger: the product-bound 42FL31 purchase panel showed 336.85 per each; explicit currency/condition and numeric shipping stock were absent from the reviewed panel. Its arrival estimate was corrected from the prior ZIP 22301 context to **22201**, with **October 20, 2026** shown for quantity one. That qualified as the fastest evidenced delivery estimate among the inspected listings; other suppliers lacked comparable arrival evidence.
- Grainger branch search was submitted for 22201. It returned 25 observed branch addresses, all with future pickup estimates and no verified numeric stock. They remain excluded from closest-in-stock ranking. Supplier-provided distances were not reused as independently verified origin distances.
- Johnstone: account access at Alexandria #461 was authenticated. The initial acceptance run left its price unresolved; the final normal-backend console run loaded a numeric price of 196.72. Currency, purchase unit, condition and numeric branch stock remained unverified, so it did not qualify for a cheapest or pickup winner. Its supplier-displayed address, **6584 Fleet Drive, Alexandria, VA 22310**, resolved through Census to approximately **38.774195, -77.155534**. Its straight-line distance from the approximate 22201 reference was 8.44 miles. Location proof alone cannot establish pickup stock.
- Original capacitor S1-02425893000 again returned query-scoped no-match at all three suppliers. Step 6 does not promote either documented alternative awaiting compatibility review.

The first live acceptance run failed its branch-coverage assertion because the adapter attempted the next dependent control before the pickup panel was ready. It retained the valid shipping quote, left pickup unknown and produced no false pickup winner. A bounded visible-control wait fixed the interaction; the full rerun captured the 25 branch records. The initial result is retained in `.local/step6-first-branch-failure.json`, and is not counted as a pass.

## Location provenance

`data/arlington-zcta.json` retains the actual 22201 row from the official 2026 Census Gazetteer, source URL, retrieval time and downloaded archive SHA-256. The internal reference point is **38.886804, -77.094992**. It is an approximate ZIP-area reference, not a precise job site or driving-distance origin. Only this reviewed ZIP-area record is bundled; other ZIP-only inputs request a full street address or coordinates.

Full street addresses use the Census `Public_AR_Current` geocoder, requiring one unambiguous result with matching street number, normalized street and requested ZIP. Coordinates are interpolated along address ranges and do **not** prove a building exists. Missing/ambiguous results and service outages stay unresolved. No paid Geocodio fallback is enabled in this zero-paid-API pilot.

Primary references checked: [Census Geocoding API, February 2026](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html), [2026 Gazetteer files](https://www.census.gov/geographies/reference-files/2026/geo/gazetter-file.html), [2026 ZCTA download](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_zcta_national.zip).

## Verification

**145 offline tests and TypeScript checks passed** in the October 18 end-to-end rerun, including the new console evidence-expiry checks. New regression coverage includes independent category eligibility and ties, quantity and pack rounding, precise cents/overflow, stale and future-dated observations, identity/quantity/destination mismatches, synthetic and alternative exclusion, missing/approximate origins, geocoder ambiguity/outage/wrong street, future pickup, shipping-vs-branch inventory, main-product isolation from recommendation prices, unsupported changed-quantity quotes, immutable refresh/idempotency, 20 concurrent refresh submissions, expiry projection, address-only cache metadata, cancellation and exact-only Step 6 searches. Logs: `.local/step6-offline.log`, `.local/step6-focused.log`.

Seven deliberate mutations were caught: wrong shipping destination accepted, stale evidence accepted, future pickup counted as ready, infinite stock accepted, expired winners retained, neighboring product price/ETA contamination and a different Census street accepted. Log: `.local/step6-mutations.log`.

Six live acceptance scenarios passed:

1. Full capture-based three-supplier comparison, duplicate request replay, origin resolution, branch cache and source/capture immutability. Job `63715416-df28-4386-b36c-5d9f9bd2b124`; six exact-number queries, 25 Grainger branches and 10 distinct saved evidence images verified through the API.
2. Quantity-two Grainger comparison withheld the default one-unit arrival quote. Job `982da487-2792-4486-865c-caedb4ded594`; three evidence images verified.
3. Normal Step 5 lookup still found the exact board at all three suppliers after comparison controls were used. Job `eee73fee-67e3-43a5-872f-a357060a7fbb`.
4. Forced real Browser Use + local Ollama navigation verified the exact requested control board at Johnstone, Parts Town, and Grainger. The fresh rerun jobs are `d5f7b153-e374-41ae-ad1c-c9eaeb17a592`, `c301e52c-a6a8-410f-9941-00d5f81f54c4`, and `eae160c7-4675-483a-b4a7-08fb1d131003`.

A new normal-console UI-to-API-to-SQLite run followed capture → six exact supplier checks → comparison, then repeated the comparison after reauthenticating Johnstone following a recorded AUTH_REQUIRED session-expiry result. The final run found the board at all three suppliers and reverified all 10 images without changing the source or capture. Details are in [E2E_VALIDATION.md](E2E_VALIDATION.md).

Detailed results: `.local/step6-live-report.json`, `.local/step6-live-job.json`, `.local/step6-live.log`. These are real observations, not fixture stock or model-generated commercial facts. Happy-path ranking of all three categories is also tested with controlled explicit evidence; it is not presented as real supplier availability.

The final console flow was also verified on the normal backend after restart, with test forcing disabled: source `85e29717-d8d0-4b37-934a-873692a1148b` → comparison `2113649a-8736-48ad-a6bb-ca3d69f5df5a`. All six exact queries completed, the entire saved source snapshot remained unchanged, all 10 evidence images returned HTTP 200, and no browser console errors were observed. The console displayed the independent category gaps and the quantity-one Grainger arrival estimate. Evidence: `.local/step6-ui-story.json` and `.local/step6-console-summary.png`. Prices, delivery estimates and inventory are point-in-time observations subject to the 15-minute ranking expiry.

## Reproduction and remaining scope

Use `npm test`, `npm run typecheck` and `npm run test:comparison-mutations`. For the live suite, stop the normal backend, run `npm run acceptance:comparison -- --serve`, authenticate Johnstone through the local credential API at READY, then enter RUN. Credentials are not saved in source or test fixtures. The test-only forcing flag is disabled before the runner remains available.

In the console, open the latest supplier results and choose **Step 6 · Compare fresh supplier information**. **Refresh Step 6 comparison** creates a new refresh while preserving the source. Do not interpret an unknown category as out of stock or a zero cost. The current live result still needs reliable Johnstone commercial data, explicit comparable condition/currency evidence and verified ready branch inventory before a complete cheapest/closest recommendation is possible. Broader models, arbitrary supplier layouts, changed-quantity arrival binding and verified installed alternatives remain outside this pilot.
