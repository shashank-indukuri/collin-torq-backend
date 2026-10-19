# Local supplier login and recovery validation — 2026-10-17

Latest hardening and broader regression evidence: [STEP5_STRESS_VALIDATION.md](STEP5_STRESS_VALIDATION.md). Earlier counts and observations below are historical validation snapshots.

Historical baseline: subsequent fixes and repeated exact-query results are documented in [SUPPLIER_COVERAGE_VALIDATION.md](SUPPLIER_COVERAGE_VALIDATION.md). The failures below describe the earlier adapter version.

## Confirmed behavior

- Primary browser controller: Stagehand 4.2.1 with the dedicated local Chrome profile.
- Live recovery: Browser Use 0.13.11 with Ollama `qwen3:4b`. The real Johnstone product-selection acceptance script passed, including original-tab handoff and independent part-number verification.
- Recovery is bounded to at most 12 observed read-only product links. The model cannot submit credentials, purchase, or navigate arbitrary destinations. URL navigation alone does not establish a product match.
- Parts Town accepted the supplied credentials. Its signed-in session survived a backend/browser restart with the remember-session option enabled. Future session expiry remains possible.
- The user authorized testing a nearby Johnstone store for Arlington ZIP 22201. Johnstone's offered list includes Alexandria #461, not an Arlington-named store. The supplied credentials were accepted at `/store461`; a signed-in control was verified.
- Johnstone store options load asynchronously. The adapter now waits for the requested option rather than interpreting the initially empty menu as an unavailable store.
- No supplied passwords were saved in source, configuration, SQLite, or model prompts. Login submissions used the local credential endpoint; Chrome retains session tokens in its dedicated profile.

## Checks

- TypeScript check passed.
- All 67 offline regression tests passed, including unsafe recovery destinations, invalid/busy connection requests, manufacturer-category navigation, and staying on an existing product page.
- `npm run smoke` passed with local Stagehand/Ollama extraction and Browser Use fixture recovery.
- `npm run acceptance:live-recovery` passed against the real Johnstone catalog.

## Authenticated supplier observations

The same captured test request was retried through all three suppliers. Detailed timestamped responses and screenshots remain in the local job/evidence store. Johnstone's board page displayed exact number `S1-33101975102`, brand **Source 1**, and **$196.72**, with Alexandria listed as **Available in 1–2 Days**. The captured guide manufacturer is York. The strict exact manufacturer matcher correctly leaves this listing unverified pending reviewed brand equivalence; no alias was silently introduced. Branch readiness, current replacement compatibility, and account-specific commercial terms remain separate verification work.

Final retry: job `8d6a564e-3456-4d01-a494-9e64654d538c` settled as **partial**, with all six checks recorded.

| Part | Johnstone | Parts Town | Grainger |
| --- | --- | --- | --- |
| Board S1-33101975102 | Exact number observed; Source 1/York brand mismatch requires review (`EXACT_ID_UNVERIFIED`) | Authenticated catalog match; displayed price $198.49 | Public catalog match; price unknown |
| Capacitor S1-02425893000 | Explicit exact-query no-match | Explicit exact-query no-match | Browser Use recovery deadline exceeded; navigation unverified |

The Grainger failure is not a no-match or stock conclusion. The live fallback works in the separate Johnstone acceptance test, but the current Qwen model did not resolve this Grainger page within the four-minute recovery budget. This run does not establish reliable end-to-end supplier coverage. Branch readiness and alternatives remain unverified. Displayed prices are observations at test time, not quotes or verified account terms.
