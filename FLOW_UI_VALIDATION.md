# Guided user-flow UI — October 18, 2026

The API-served user-facing walkthrough is available at `http://127.0.0.1:4310/flow`. The existing developer console remains at `/` and links to the clean flow. The guided screen keeps the main actions visible, puts guide and supplier evidence in collapsed details, and does not show raw API JSON or implementation codes by default.

## Supported path

1. Enter equipment, job location, requested part names/quantities, and supplier scope.
2. Review the guide result. If a prefix has a matching longer model, select the full candidate and continue; the flow preserves a separate test-model vs nameplate-confirmed basis.
3. Choose the guide component for each requested line.
4. Save the selected identifiers; no supplier lookup occurs before this action.
5. Start exact-number supplier searches. The account suppliers can be opened in the dedicated local Chrome profile; the UI does not collect or store passwords.
6. Refresh Step 6 and compare the supported categories. Missing price, quantity, stock, ETA, or location evidence stays explicitly unverified.

The page resumes the most recent job after reload using its local job ID. It does not implement quote creation, exporting, or email delivery; those backend actions are not available in this pilot.

## Live UI run

Used Playwright against the actual API-served page. Starting from York E1RD036 with control board and capacitor at Arlington, VA 22201:

- The prefix paused for full-model confirmation; the UI proceeded with `E1RD036S06B` under the explicit **test model** basis.
- The user-flow selectors presented `Control, Defrost` and the 40/5 MFD run capacitor; both were selected and captured through the capture API.
- Step 5 checked all three suppliers for both identifiers. Parts Town found the control board at $198.49 each and showed shipping quantity 9. Grainger found its exact normalized S1 number at $336.85, with the currency caveat preserved. The capacitor had no exact listing in the inspected Parts Town/Grainger results. Johnstone returned `AUTH_REQUIRED`; the UI showed sign-in needed and retained the error for optional review.
- Step 6 returned the Grainger October 20, 2026 delivery estimate for the control board to 22201. Cheapest and nearest ready pickup remained unverified; the capacitor had no ranked result. The UI displayed these gaps instead of fabricating winners.
- Reloading the page restored the active saved job. No browser console errors remained after adding an inline empty favicon.

Jobs: source `7d785126-8c4c-4fc7-814c-b35ee5d14fc9`; Step 6 comparison `244e091a-71d1-464e-9124-e87ab83637f9`.

## Checks

- `npm test`: 146 passed, 0 failed.
- `npm run typecheck`: passed.
- Inline browser JavaScript parsed and the Playwright user flow completed through Step 6.

These are point-in-time sourcing observations using an explicitly test-only model. They do not establish the installed model, complete supplier coverage, purchase readiness, or compatibility for installation.
