# Step 4 validation — October 17, 2026

The source workflow defines step 4 as capturing the correct part number, name/description and specifications for the equipment. Step 5 starts supplier searching. This change implements reviewed capture from step-3 candidates.

## Implemented

- Explicit component selection for every line; selection controls start empty.
- Model basis recorded as test model or user-confirmed full model. The default E1RD036S06B demonstration remains a test model.
- Server-selected identifiers/specifications from revalidated PDF evidence; client-supplied replacement data is rejected.
- Durable `capturedParts` snapshot with requested names, quantities, manufacturer, historical part number, guide description, specifications, original source row/header/page/model column, guide hash and revision.
- Unknown voltage stays null. Current supersessions, installed compatibility and alternative specifications remain unverified.
- Snapshot/hash checks, duplicate/missing/out-of-range selection rejection, changed-evidence rejection and a final state check after asynchronous reads.
- Identical retries return the same capture; different finalized selections conflict. Captures survive reopening SQLite.

## Results

- Typecheck passed.
- All 53 regression tests passed, including prior guide/extraction/supplier tests and 14 new capture cases.
- Two deliberately faulty temporary implementations were rejected: accepting changed candidate evidence, and overwriting a cancellation after revalidation.
- Real guide browser acceptance passed: Stagehand/Chrome → API → verified PDF → candidate selection → SQLite → rendered capture.
- Existing step-3 browser acceptance passed after switching the default console example to step 4.

The live-PDF capture saved historical identifiers S1-33101975102 (Control, Defrost) and S1-02425893000 (40/5 MFD run capacitor) for the explicit test model. Both retained page-2/model-column-4 evidence. No supplier search ran.

## Reproduce

```sh
npm run typecheck
npm test
npm run test:capture-mutations
# Stop the backend before each browser command:
npm run acceptance:capture
npm run acceptance:parts
```

Use `GET /api/examples/step4`, create a durable `/api/searches` job, then submit one `{lineIndex,candidateIndex}` choice per requested line to `POST /api/searches/:id/capture`. Include the job's current `expectedUpdatedAt`, `expectedGuideSha256` and explicit `modelBasis`. The console performs this interaction with dropdowns and **Capture selected parts**.

## Limits

A saved capture establishes which historical guide rows the user selected. It does not establish the physical equipment's model, modern replacement numbers, installed compatibility, supplier inventory, or complete specifications for alternatives. The incomplete historical distributor-mirror warnings are retained. Supplier verification is the next step.
