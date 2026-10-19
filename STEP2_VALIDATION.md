# Step 2 validation — October 17, 2026

Story: Collin's hardcoded York E1RD036 intake → guide API → verified PDF/cache → persisted job → model confirmation in the console.

## Conclusion

`needs_model_confirmation` is correct for the supplied abbreviated model. The retrieved guide's model table lists E1RD036S06B, but the user's intake provides E1RD036. A match in this one document cannot establish the installed equipment's suffix or exclude other variants. No suffix or part number is inferred.

The original cached result contains an intact PDF with SHA-256 `331d0f3992a3e46c3196c8832b409b5a48941eccc091e094cdfb72bb5eeb804a`. A fresh source download matched that hash. The PDF is Johnson Controls / Source 1 document 035-21220-001 Rev. E (0409), hosted by a distributor. It has three actual pages; printed numbering declares four. Its age, missing page, mirror provenance and unverified serial applicability remain visible limitations.

Source: https://www.hvacrmart.com/assets/images/Resources/JOHCONE00442_1-3.pdf

## Issues fixed

- Model coverage previously trusted cached extracted text after validating only the PDF checksum. Coverage now derives from the verified PDF, with parsed evidence reused only for an already verified content hash. Changing metadata text cannot manufacture an accepted suffix. PDF bytes are still checksum-checked on cache reads.
- The missing-page warning previously embedded the initially observed page count. It now compares actual page count with printed numbering.
- Missing equipment manufacturers previously defaulted silently to York. The resolver now requires a manufacturer; the worker accepts an explicit York prefix or a supplied manufacturer, requests missing information and rejects conflicting manufacturers.

## Regression coverage

`npm test`: 27 tests, including the existing supplier matching/cost/consent cases and guide-specific cases:

- Multiple matching suffixes remain ambiguous; body mentions do not count as model headings.
- Exact listed suffix succeeds; an absent suffix fails without part extraction or offers.
- HTTP 404, simulated timeout, HTML response, missing body, declared/streamed oversize, invalid document identity, absent headings and parser failure return unavailable.
- Offline cache reuse, malformed metadata recovery, text tampering, PDF corruption, failed-download retry and simultaneous requests.
- API input validation, PDF evidence retrieval, clarification transitions, terminal-state guards and persisted guide results after reopening SQLite.
- Missing/conflicting manufacturers and cancellation during an in-flight download.

`npm run test:guide-mutations`: 3 deliberately faulty temporary implementations must fail the regression suite: prefix accepted as exact, metadata text trusted, checksum validation removed. Working sources are not modified.

`npm run acceptance:guide`: real network PDF download and real Python PDF extraction, prefix/exact/wrong suffix checks, offline cache reuse, text tampering and corrupt PDF rejection.

`npm run acceptance:guide-ui`: Stagehand/Chrome console submission → API → real PDF → SQLite → paused prefix → deliberately wrong suffix remains paused → listed suffix completes only guide resolution. The exact suffix used in the test does not constitute confirmation of Collin's equipment.

`npm run typecheck`: TypeScript validation.

## Scope

This validates the reviewed York guide path. It does not validate the installed unit, current supersessions, requested part extraction, supplier stock, or unimplemented guide-discovery fallbacks. A cache hit reports reuse of known evidence; it does not mean the other discovery paths were searched.
