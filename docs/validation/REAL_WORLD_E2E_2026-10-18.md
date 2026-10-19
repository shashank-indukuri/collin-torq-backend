# Real-world sourcing checks — October 18, 2026

## Scope

Ran three workbook-derived, read-only requests through the local API, the serialized supplier browser, live supplier product pages, fresh commercial extraction, Arlington ZIP resolution, and Step 6 comparison. Each request used an explicit manufacturer part number and searched Johnstone Supply, Parts Town, and Grainger. No cart or order actions were taken. These cases exercise live Steps 5–6; they do not independently establish equipment-guide applicability for the Trane or York units.

The existing guide-to-capture York E1RD flow remains covered separately in [E2E_VALIDATION.md](E2E_VALIDATION.md). The workbook also includes suppliers outside this backend's current three adapters, so this is not full workbook supplier coverage.

## Results

| Case | Live supplier result | Commercial observation | Step 6 outcome |
| --- | --- | --- | --- |
| Trane SCWFN8042, FUS00907, requested as Class T 150A/600V, quantity 3 | Parts Town returned exact Trane FUS00907. Johnstone returned a query no-match; Grainger could not verify product identity. | Parts Town showed $51.79 each and quantity available 2. Its product description/specification says 160A, 600VAC, Class T. | No winner. Quantity 2 is below requested 3, and 150A vs 160A is a visible rating conflict. The live result now flags the conflict and the comparison excludes the result. |
| York D7CG048, S1-02625511000 propeller blade, quantity 1 | Parts Town returned exact York S1-02625511000. Johnstone could not verify exact identity; Grainger could not verify product identity. | $105.49 each; quantity available 20 for shipping. Listing describes a 24-inch, clockwise, 3-blade propeller. Condition, destination-specific ETA, local branch inventory, and D7CG048 fit were not confirmed. | No winner. Product existence and observed shipping quantity are useful sourcing evidence, but do not prove equipment fit or support a cheapest, nearest-ready-stock, or fastest-delivery claim. |
| Trane SCWFN8042, COM09751 compressor, quantity 1 | Parts Town returned exact Trane COM09751. Johnstone and Grainger returned query no-match. | $5,827.59 each; quantity available 2 for shipping. Condition, destination-specific ETA, branch inventory, and SCWFN8042 fit were not confirmed. | No winner. Commercial evidence is incomplete and equipment compatibility is unverified. |

ZIP-only origin resolution used the 2026 Census ZCTA reference point for 22201, explicitly approximate rather than a job-site location. Parts Town showed shipping inventory, not local Arlington branch stock. A supplier `no_match` means the exact web query was not found in that adapter's inspected view; it is not proof that the item is unavailable from that supplier.

## Reliability change found by the live test

The first fuse run revealed that an exact manufacturer part number could coexist with a contradictory requested amperage without a dedicated warning. Added deterministic checks for explicit amperage, voltage, and fuse-class values in the user's line description versus the returned primary product description. A detected conflict is retained as evidence, shown in commercial issues, and excluded from all Step 6 winner categories. Unknown ratings remain unknown; the check does not infer compatibility.

After restarting the local API, repeated the fuse lookup. The response contained `Requested specification conflict: amperage 150A requested, 160A listed` and Step 6 listed the result under `excluded`; no winner was produced.

## Verification

- `npm test`: 146 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run test:comparison-mutations`: seven deliberate evidence, stock, expiration, product-panel, and address mutations were caught.
- Live post-fix fuse request: `c9d4187e-4e17-4042-a78b-e22086f1e400`.
- Initial live examples: fuse `3d16a361-0ef1-4573-ad12-f4c6dea688e5`; propeller `5b26ea44-4bb1-4f1d-8e5e-a7798fdd3b9c`; compressor `ce4e4f6b-04b7-4680-b0a7-273faf844ddd`.

## Readiness assessment

The backend performed useful exact-number live searches and preserved unknowns instead of fabricating a comparison. The fuse discrepancy was a real safety-relevant gap and is now caught by a regression test and surfaced in live output. This run does **not** demonstrate complete Step 6 comparisons: no case had the required verified combination of new condition, sufficient stock, branch coordinates or destination-bound delivery date. It also does not prove installed-equipment compatibility or broad coverage across every workbook supplier. Treat results as sourcing leads for review, not purchase or installation approval.
