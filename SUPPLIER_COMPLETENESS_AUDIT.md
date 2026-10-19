# Supplier result completeness audit — October 18, 2026

## Reviewed request

API comparison job `2b4ef092-f8a5-4179-b583-e1f27b9e3e3e`, York E1RD036S06B, control board S1-33101975102 and historical capacitor S1-02425893000, quantity one, Arlington ZIP 22201. Reviewed the API payload, saved supplier screenshots, existing Johnstone probe text, commercial parsers, ranking policy and Browser Use recovery implementation. No fresh supplier-stock claims are made by this audit.

## Confirmed implementation gaps

1. **Johnstone availability rows are discarded.** The saved `.local/step6-probe-johnstone.json` contains a Store/Qty table: Alexandria and several other branches say Available in 1–2 Days, while Arbutus #406, Rosedale #369, Easton #123 and Pittston #704 contain a numeric quantity of 1. `parseCommercial` only parses the selected store address from the footer and always sets that branch stock to null. These saved observations demonstrate missed extraction; they are not current inventory assertions. Numeric quantity alone must not be converted to a guaranteed immediate pickup promise.
2. **Missing fields can be implementation defaults.** `johnstoneCatalog` always assigns null currency, unit, pack size and condition. Johnstone commercial extraction does not resolve those fields. Grainger currency is only recognized if its purchase-panel text literally contains USD. These rules do not use other verified page metadata or documented supplier context.
3. **Commercial interaction coverage is incomplete.** `collectCommercial` implements destination and pickup interactions for Grainger. Johnstone and Parts Town mostly read page text; there is no equivalent complete branch/ETA interaction workflow or commercial recovery fallback for them.
4. **The Browser Use fallback is product selection, not a general shopping assistant.** Live recovery exposes only bounded product-candidate navigation and completion. Input, scrolling and generic selection are disabled; vision is off. It cannot currently recover a missing availability panel, enter a ZIP, investigate stores or discover replacement numbers. This is an application capability restriction, not evidence of a Qwen inference failure.
5. **Ranking gates prevent useful partial comparisons.** Lowest verified purchasable cost requires an explicitly new condition plus comparable price/units and sufficient stock. All three board observations have unknown condition, so none can win that category. Observed-price comparisons should be a distinct, clearly qualified category rather than silently relaxing purchase-readiness rules or showing only an empty result.
6. **Exact-number absence and replacement discovery are separate.** The request disables alternatives. The historical capacitor receives exact-query no-matches. Existing alternative review uses a small fixed set of reference URLs; it is not general replacement discovery. No exact match does not establish supplier inability to provide a current replacement.

## What the evidence establishes

Board identities were found at all three suppliers; displayed commercial amounts were captured ($196.72 Johnstone, $198.49 Parts Town, $336.85 Grainger). Parts Town displayed USD, Each and shipping quantity 9. Grainger supplied a destination-bound arrival estimate. These observations do not establish immediate local stock, final account terms, installed fit or the capacitor's current replacement.

The input is sufficient for exact-number lookup. The incomplete output is primarily explained by implementation and workflow gaps. A direct same-task Claude-extension comparison and a local-model benchmark have not been performed; no relative model-success claim is justified.

## Required execution order

1. Build a manually verified baseline on the same supplier account, part, quantity, ZIP and observation time. Record each field, its page/panel source and the actions needed to expose it.
2. Complete Johnstone Store/Qty extraction and branch-address discovery first. Preserve numeric inventory, future availability and immediate pickup as separate observations. Demonstrate a nearest-stock result only when branch location, quantity units and pickup applicability are established.
3. Complete each supplier's purchase unit/currency and ZIP/quantity/availability interaction. Capture field provenance and distinguish authenticated displayed prices from verified contractual terms.
4. Add bounded Stagehand semantic recovery for missing commercial controls, and scoped Browser Use recovery for those same read-only goals. Verify panel state, product identity, ZIP and quantity after every recovery; do not allow cart or order actions.
5. Surface documented supersession/substitute review in the guided flow. Preserve original numbers, replacement-chain evidence, specification conflicts and unresolved installed ratings.
6. Display observed comparable prices separately from verified purchasable-cost winners. Preserve genuine unknowns while explaining whether an action was attempted, failed, unsupported or the supplier did not supply the field.
7. Run identical happy-path, changed-layout and browser/model recovery cases against the manually verified baseline. Require completeness of available fields, provenance and repeated-run success; passing parser tests alone is not beta readiness.

## Readiness

Useful exact-number sourcing prototype. Complete supplier commercial extraction, commercial browser recovery and general alternative discovery are not yet demonstrated. The existing passing regression suite does not establish these missing capabilities. Do not describe the workflow as beta-ready until the above baseline and acceptance criteria pass.
