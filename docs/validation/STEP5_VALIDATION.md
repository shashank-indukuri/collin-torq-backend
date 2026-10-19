# Step 5 validation — October 17, 2026

Latest hardening and broader regression evidence: [STEP5_STRESS_VALIDATION.md](STEP5_STRESS_VALIDATION.md). Earlier counts and observations below are historical validation snapshots.

## Implemented behavior

The saved step-4 capture starts a separate exact-number sourcing job. Captured manufacturer numbers and quantities are selected server-side; source evidence and test-model context survive. The original capture remains unchanged. Identical capture/supplier scopes resume the same job. Failed/partial jobs can be retried after reconnecting suppliers.

Each supplier attempt records its query, timestamp and found/no_match/error outcome. Browser screenshots are retained for offers, explicit no-match pages and failures when capture is possible. Screenshot filenames are unique per observation. Empty/unverified/challenged pages do not imply unavailable stock. Supplier failures take precedence over the alternatives-permission state and produce partial results.

Parts Town public product labels support deterministic identity/price extraction. The parser handles legacy punctuation, title ordering, seller/ship-from information and separate supplier SKUs. Public displayed prices are labelled; they are not authenticated account terms. Grainger uses Stagehand with the existing local Qwen model, product-detail navigation and visible-text checks. Johnstone requires a connected session; authenticated pricing behavior remains unverified.

No company-wide or shipping inventory is promoted to branch stock. Local quantity and pickup readiness remain null and these offers cannot enter pickup/closest rankings. Captured alternatives remain blocked until specifications and replacement evidence are verified. No remote model or paid service fallback was added.

## Live end-to-end result

Passed Stagehand/Chrome → developer console → API → capture → supplier pages → SQLite → rendered results/evidence. Source job: `8d6a564e-3456-4d01-a494-9e64654d538c`; parent capture: `c54ab711-5e39-4bf2-bd11-992ec2375623`.

| Captured part | Supplier | Observed outcome |
| --- | --- | --- |
| Defrost control S1-33101975102 | Johnstone | AUTH_REQUIRED; not a completed account search |
| Defrost control S1-33101975102 | Parts Town | Exact public catalog listing, seller retained |
| Defrost control S1-33101975102 | Grainger | Exact public product identity; price unknown in the final accepted run |
| Capacitor S1-02425893000 | Johnstone | AUTH_REQUIRED |
| Capacitor S1-02425893000 | Parts Town | Explicit no-match search page |
| Capacitor S1-02425893000 | Grainger | PRODUCT_DETAILS_UNVERIFIED |

The accepted board listings displayed the punctuation-equivalent identifier S1-331-01975-102. Original supplier formatting is retained. The Parts Town board observation came from a third-party seller. Neither listing established installed compatibility, a modern supersession, local branch inventory or an arrival date.

Sources observed by the application:

- https://www.partstown.com/p/york/yorks1-331-01975-102
- https://www.grainger.com/product/YORK-Defrost-Control-Board-Kit-42FL31

The correct overall state is **partial** because account/site checks remain unresolved. The capacitor cannot be declared unavailable across suppliers. No alternative search ran.

## Regression evidence

- Typecheck passed.
- All 63 offline tests passed: previous 53 plus 10 sourcing/catalog/cancellation cases.
- Two intentionally faulty temporary worker implementations were caught: erasing captured evidence and treating supplier errors as a complete no-match permission state.
- The existing synthetic browser acceptance passed, including alternatives consent and evidence retrieval. Synthetic results are not live supplier evidence.
- The updated UI replay resumed the same saved sourcing job without repeating supplier calls, with steps 2–4 collapsed as history and current supplier outcomes visible.

```sh
npm run typecheck
npm test
npm run test:sourcing-mutations
# Stop the backend before browser checks:
npm run acceptance:sourcing
npm run acceptance
```

The live acceptance intentionally depends on current supplier accessibility and real public board evidence. It can fail when sites change or become unavailable. It does not require a fixed public price.

## Use and remaining limits

Refresh the console, choose **Open latest captured request**, and click **Start / resume exact supplier search**. To validate Johnstone account results, use **Connect johnstone** with sourcing idle, sign in in the dedicated Chrome window, and retry the partial job. No supplier credentials were saved in source code.

Authenticated Johnstone coverage, account-specific Parts Town pricing, general site recovery, specification-verified alternatives, current supersessions, branch inventory and shipping rankings remain unverified or unimplemented. These pilot adapters should not be represented as production-ready sourcing coverage.
