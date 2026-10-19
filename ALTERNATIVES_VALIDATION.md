# Documented alternatives review — 2026-10-17

Latest hardening and broader regression evidence: [STEP5_STRESS_VALIDATION.md](STEP5_STRESS_VALIDATION.md). Earlier counts and observations below are historical validation snapshots.

This implementation discovers and checks documented replacement candidates. It does not automatically approve installation compatibility. The historical capture and exact supplier results stay unchanged.

## Implemented

`POST /api/searches/{id}/alternatives/review`

```json
{"expectedUpdatedAt":"<current job timestamp>","allow":true}
```

An optional `installedVoltageVac` records the user's reported installed capacitor rating separately from the historical guide. It never rewrites that guide or claims independent nameplate verification. The console provides **Review documented alternatives** and the same optional voltage field. This is separate from the existing generic alternatives endpoint, which remains blocked for unverified captured specifications.

Only captured jobs with complete exact no-match outcomes for an unresolved part can enter this review. Stale snapshots, injected URLs/part numbers, incomplete supplier scope, and conflicting idempotent replays are rejected. Exact offers already found for other lines are retained. Original input permission flags and the captured parent remain unchanged.

The reviewed pilot discovers **York S1-02425893700** and the OEM-listed successor **S1-CAP4405040DR** for original **S1-02425893000**. Generic part-name searching and other components are explicitly unsupported by this first review adapter. It reads these live sources through Stagehand:

- [Technical Hot & Cold product page](https://www.technicalhotandcoldparts.com/york-coleman-s1-02425893700-dual-run-capacitor/) explicitly lists the original identifier under **Replaces Old York Coleman Part Numbers**. This is a supplier's replacement claim, not an OEM supersession bulletin.
- [York catalog](https://www.yorknow.com/s102425893700.html) identifies candidate S1-02425893700 as a round dual-run capacitor rated **40/5 µF, 370 V** and explicitly names **S1-CAP4405040DR** as its substitute.
- [York successor catalog](https://www.yorknow.com/s1cap4405040dr.html) confirms the successor is **40/5 µF, 440 V, round dual run**. Candidate voltages do not establish the installed rating. The visible dimension strings differ (`3Hx3Wx6D` and `3Hx3Wx5D`), and their rows do not state units; these values are preserved without inventing units or physical fit.

Source heading, visible text, timestamp, screenshot and SHA-256 are retained. Saved text is served by `/api/searches/{id}/alternative-references/{hash}` only if the reference belongs to that job and its checksum verifies. Source screenshots and alternative supplier screenshots are available through the existing authorized evidence route.

After reference checks succeed, the candidate's exact identifier is searched at Johnstone, Parts Town and Grainger. Those supplier matches are stored in `alternativeReview`, labelled `alternative`, with `eligible:false` and `total:null`; they cannot become exact matches for the original identifier or enter rankings.

## Verification rules

- The original number must appear as a complete identifier inside the supplier's explicit replacement list, with the new number in its product heading.
- OEM SKU and primary heading must agree before candidate specifications are accepted. Both inline and multiline live SKU layouts are covered.
- Candidate capacitance must match the guide. A lower candidate voltage than the user-reported installed rating rejects the candidate; unknown installed voltage remains missing.
- A supplier cross-reference cannot satisfy the OEM-replacement-authority check. Multi-step paths must be complete and directed; cycles, reversed edges and missing links fail. The 440 V successor retains the first supplier-only edge, even though its second edge is OEM-documented. It cannot inherit an all-OEM approval.
- Mounting dimensions, terminals, frequency, tolerance, temperature rating and installed wiring remain required installation checks. No current path approves installation or ranking.
- Source challenge/failure, supplier authentication failure and unreadable pages remain errors. They cannot become no-match or compatibility success.
- Cancellation prevents subsequent supplier operations and state overwrites; retries repeat the review without erasing exact results.

## Tests

All **92 offline regression tests** pass, along with TypeScript and console JavaScript syntax checks. Coverage includes incorrect/mis-scoped references, wrong OEM SKU, recommendation contamination, capacitance/voltage conflicts, unknown ratings, supplier-versus-OEM authority, stale/idempotent permissions, injected destinations, supplier errors, cancellation, exact-result preservation, and altered saved source bytes.

Run the real review against the running authenticated local backend with:

```sh
npm run acceptance:alternatives
```

The acceptance verifies all three reference snapshots, six supplier attempts, evidence retrieval, preservation of the exact results/capture, and the intentional `needs_review`/`needs_input` outcome. It must not assert that an unverified replacement is ready to install.


## First-candidate live baseline

The earlier one-candidate review passed twice: once through `npm run acceptance:alternatives`, and once initiated with the console’s **Review documented alternatives** button. Both runs retained the captured snapshot and exact-search results, verified both saved reference endpoints, and ended intentionally as `needs_input` / `needs_review`.

| Candidate S1-02425893700 | Result |
| --- | --- |
| Johnstone | Found; alternative candidate only; displayed price unknown |
| Parts Town | Found; alternative candidate only; displayed price $47.19 at test time |
| Grainger | Explicit exact-query no-match for this candidate identifier |

Both runs produced no reference or supplier errors. Screenshot retrieval and saved reference integrity were verified. No model calls were needed for the final known layouts. Prices are observations, not quotes or verified account terms. Branch inventory remains unverified.

**Still needed to approve a replacement:** the installed capacitor’s voltage rating, an authoritative OEM original-to-new replacement reference, and physical/installation-fit verification. The supplier’s reference proves what that supplier claims; it does not replace those missing checks. The application preserves this distinction and cannot approve the candidate or use it for ranking.


## Source failures and bounded query inspection

Public OEM catalog pages intermittently returned HTTP 500 during validation. Reference reads retry once. If a recent, previously validated snapshot exists, the review can use it for up to 24 hours with `cacheHit:true`, its original observation time, a refresh warning and the current refresh-attempt time. Checksum, SKU/heading, source URL and age are checked; missing, changed or expired evidence fails closed. Changed but readable source content is not silently replaced by an older successful page. The initial cache was populated from actual reference snapshots captured earlier in this session, after checking their on-disk hashes and screenshot files. No source text or timestamps were fabricated.

Grainger can redirect S1-CAP4405040DR into a category with two different products. The adapter waits for lazy product rows and inspects at most five observed detail pages. It records `noMatchEvidence` only when the complete query result count is at most five, all distinct returned product identities were read, and none has the requested normalized part number. Any unreadable item, incomplete/paginated set, stale query, mismatched evidence URL, or matching number under an ambiguous brand prevents this conclusion. This means **no exact identifier among this query's returned products**, not absence from Grainger's entire catalog. Each inspected product has its own screenshot and URL.

Informational paths such as `/content/mc/product-collections` are excluded from model recovery. The live category table's optional “Available” badge is supported between query heading and result count. Product details must have the required identity fields loaded before a conclusion.


## Final two-candidate validation

The final `acceptance:alternatives` run passed with all three reference snapshots, both candidates and all six supplier attempts. Every saved reference, source screenshot, supplier screenshot and inspected Grainger product screenshot returned successfully. The console shows both candidates, all missing checks, complete-result inspection and dated cache warnings.

| Candidate | Johnstone | Parts Town | Grainger |
| --- | --- | --- | --- |
| S1-02425893700 | Found | Found | Explicit exact-query no-match |
| S1-CAP4405040DR | No match | Found | No exact identifier among all two returned products |

The Grainger category returned TITAN HD PRCF5A and DAYTON 2MEJ7. Both detail identities were inspected and retained as evidence; neither is the requested York identifier.

The supplier replacement reference was freshly observed at `2026-10-18T02:23:59.318Z`. The two OEM references used validated cached observations from `2026-10-18T02:03:22.993Z` and `2026-10-18T02:03:24.636Z`; live refresh returned server errors. These are source observations from October 17 in the local Eastern time zone. Current OEM content remains unverified during that outage.

A fresh original-number supplier regression also passed **6/6** checks after these changes: the board was found across all three suppliers and the original capacitor returned exact-query no-match across all three. The offline suite passed **92/92** tests. These checks establish the supported pilot behavior, not universal supplier coverage or installation compatibility.

Local artifacts: `.local/alternatives-live.json`, `.local/alternatives-acceptance.log`, `.local/supplier-coverage-after-alternatives.log`, and `.local/alternatives-console.png`. The reviewed job is `8d6a564e-3456-4d01-a494-9e64654d538c`; it intentionally remains `needs_input` with `alternativeReview.status: needs_review`.
