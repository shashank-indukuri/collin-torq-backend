# End-to-end validation — October 18, 2026

The fresh browser flow passed from the local console through saved SQLite jobs, real supplier pages, comparison evidence and a backend restart. The console is open on the comparison. No email was sent to Collin.

## Browser story

- Entered Collin’s original York prefix request. The UI paused for the full equipment suffix instead of assuming it.
- Loaded the explicit test model E1RD036S06B. The guide and part extraction returned Control, Defrost (S1-33101975102) and capacitor S1-02425893000 (40/5 MFD; voltage unknown).
- Capture stayed disabled until both line items were explicitly selected. The saved capture is marked `test_model`; installed model and compatibility remain unconfirmed.
- Searched the captured exact numbers at Johnstone, Parts Town and Grainger. The control board was found at all three. The historical capacitor identifier returned query-scoped no-match at all three. The job appropriately paused for alternatives permission; no alternatives were included in Step 6.
- Created a separate Step 6 comparison from the same source. It retained the October 20, 2026 Grainger delivery estimate for ZIP 22201 at quantity one. Cheapest price and closest in-stock pickup remained unverified because comparative currency/condition and ready branch stock were not established.
- Verified all 10 saved evidence images returned HTTP 200 and that the captured source and its six supplier attempts were unchanged by comparison.

Jobs: capture `a8452e96-aebf-4074-ad25-30b9c0502bd4`; supplier source `a8ad78d0-1db2-499f-8812-d84a4d64a4dd`; comparison `09c8319b-6158-4401-a580-c25eaee7dd75`. Full saved UI/API record: `.local/handoff-ui-story.json`.

## Live recovery and regression

The real comparison runner passed six cases: fresh source-based three-supplier comparison and idempotent replay, quantity-two ETA rejection, normal exact Step 5 search, and forced Browser Use/Ollama product recovery for each supplier. The three model-recovery jobs independently verified exact board identity after navigation:

- Johnstone `d5f7b153-e374-41ae-ad1c-c9eaeb17a592`
- Parts Town `c301e52c-a6a8-410f-9941-00d5f81f54c4`
- Grainger `eae160c7-4675-483a-b4a7-08fb1d131003`

All 145 offline tests and TypeScript checks passed. Seven deliberate Step 6 mutations were caught. A new console regression verifies that an open completed comparison clears expired winners when its 15-minute evidence validity ends, while preserving the stored historical record. The automated comparison run passed all six cases, and the final authenticated UI refresh passed its additional checks. Full output is in `.local/handoff-live.log`, `.local/handoff-offline.log`, `.local/handoff-typecheck.log` and `.local/handoff-mutations.log`.

## Runtime and limits

The normal backend was restarted after the test runner, remains on `127.0.0.1:4310` (PID recorded in `.local/backend.pid`), reports healthy, and sees the saved comparison after restart. Ollama `qwen3:4b` is available. Test forcing is disabled.

This is a local pilot; loopback is available only on the machine running it. The supplier observations are time-sensitive and Step 6 winners expire after 15 minutes. The test model is not confirmed as Collin’s installed equipment. Current available evidence still does not support cheapest-source or nearest ready-stock claims. Collin should not treat this run as purchase or installation approval.
