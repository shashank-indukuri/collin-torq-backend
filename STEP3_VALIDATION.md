# Step 3 validation — October 17, 2026

## Verified scope

Historical part extraction from the reviewed York E1RD PDF for the explicitly selected test model E1RD036S06B. Collin supplied the abbreviated E1RD036; his installed equipment suffix remains unconfirmed.

The model column yields:

| Requested name | Guide description | Historical part number | Outcome |
| --- | --- | --- | --- |
| control board | Control, Defrost | S1-33101975102 | Candidate requires component clarification |
| capacitor | Capacitor, Run (40/5MFD) [RC] | S1-02425893000 | One applicable row |

Both rows are on PDF page 2, model column 4. Capacitor voltage is unstated and remains null. Source evidence retains every model cell, original row/header, revision and PDF SHA-256 `331d0f3992a3e46c3196c8832b409b5a48941eccc091e094cdfb72bb5eeb804a`.

Source: https://www.hvacrmart.com/assets/images/Resources/JOHCONE00442_1-3.pdf

## Checks passed

- TypeScript typecheck.
- All 39 offline regression tests, including the previous 27 tests and 12 new extraction/API/persistence cases.
- Four deliberate faulty temporary implementations were rejected: adjacent-column selection, not-applicable marker accepted as a part, broad board request silently confirmed, and missing-cell alignment accepted.
- The three existing guide mutation checks still passed.
- Step 3 real-data browser acceptance: Stagehand/Chrome → API → verified PDF → SQLite → rendered candidates → component clarification → completed extraction.
- The existing step 2 Chrome acceptance still passed after changing the default console example.

The browser run blocked E1RD036 and unlisted E1RD036S46B before extraction. For E1RD036S06B, it paused for the broad board name, preserved the correct capacitor number/specification and unknown voltage, served the source PDF, and persisted both candidates. Changing the request to "defrost control" and "run capacitor" completed extraction. No supplier offers were produced.

## Commands

```sh
npm run typecheck
npm test
npm run test:parts-mutations
npm run test:guide-mutations
# Stop the backend before each browser acceptance command:
npm run acceptance:parts
npm run acceptance:guide-ui
```

The console defaults to the step 3 test input. "Load Collin step 2" retains the original abbreviated model demonstration. Use `stopAfter: "parts"` for durable extraction jobs, or `POST /api/guides/extract` for standalone extraction.

## Limits

The table grammar and description aliases cover the reviewed E1RD guide. There is no general OCR/PDF interpretation, current-supersession validation or automatic supplier handoff. Historical revision, incomplete mirror and serial-applicability warnings remain visible. The test model and clarified component names used during acceptance are test inputs, not confirmation of Collin's physical equipment.
