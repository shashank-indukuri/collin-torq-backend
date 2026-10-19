# Browser automation recommendation for Torq Slim

Research date: October 17, 2026. This is documentation research and an engineering recommendation, not a supplier benchmark. No live supplier logins, paid infrastructure, or model experiments were run.

## Recommendation

Start the York pilot with a TypeScript supplier worker using Stagehand and Browserbase. Use deterministic page operations for the known path, bounded AI assistance for recovery and extraction, and application code for validation. Compare Browser Use Cloud as the cheaper infrastructure/agent challenger before committing beyond the pilot. Keep browser hosting behind a small application-owned interface.

Stagehand and Browserbase are different layers: Stagehand is an MIT-licensed open-source control SDK; Browserbase is a commercial browser host. Stagehand v4 uses CDP directly and Playwright-style APIs; it is not built on the Playwright runtime. Do not mix old v2/v3 examples into v4 implementation. Pin and test a release rather than deploying a floating latest version.

The current Stagehand documentation describes deterministic page APIs, AI act/observe/extract methods, typed extraction, and per-method usage metrics. These align with a small number of recurring supplier workflows. Browserbase adds persistent contexts and interactive live views, useful for account connection and diagnosis. These capabilities support the recommendation; they do not prove reliability on Johnstone, Parts Town, or Grainger.

Sources: [Stagehand introduction](https://docs.stagehand.dev/v4/first-steps/introduction), [repository and license](https://github.com/browserbase/stagehand), [v4 migration](https://docs.stagehand.dev/v4/migrations/v3).

## Alternatives reviewed

| Project | Role and documented capabilities | Fit for Torq Slim |
| --- | --- | --- |
| Stagehand | Open-source SDK mixing deterministic controls and AI actions/extraction; Chromium/CDP; current v4 architecture | Preferred first control SDK for repeatable supplier adapters with limited AI recovery |
| Playwright | Programmatic browser automation, actionability checks and waiting, reusable authentication state | Strong deterministic baseline and regression tool; no automatic business understanding or semantic recovery by itself |
| Browser Use | MIT Python browser-agent library, local or cloud operation, model flexibility; hosted browser infrastructure can also be used separately | Main challenger; especially attractive if live results justify its lower hosted browser price |
| Skyvern | Broader AI workflow platform with self-hosted core and hosted service | Worth considering for many varied workflows; less direct fit than a small SDK for the initial three suppliers. Core is AGPL-3.0; hosted anti-bot features are excluded from the open-source core |
| agent-browser | Open-source CLI/MCP browser control, isolated sessions, saved state, streaming, multiple hosts | Useful for development and an agent tool interface; our application would still need jobs, validation, account lifecycle, and supplier adapters |
| Chrome DevTools MCP / Playwright MCP | Open-source tool interfaces for agent-driven browser inspection and actions | Useful for exploration/debugging and embeddable agent tooling. MCP itself does not provide a complete production sourcing service |
| OpenAI computer use | API paths for screenshot/action control, browser tools, and an OpenAI-hosted browser | A possible bounded fallback or alternative harness. Evaluate actual cost and outcomes rather than assuming the desktop experience transfers unchanged |

Sources: [Playwright waiting](https://playwright.dev/docs/actionability), [Playwright authentication](https://playwright.dev/docs/auth), [Browser Use](https://github.com/browser-use/browser-use), [Skyvern](https://github.com/Skyvern-AI/skyvern), [agent-browser](https://github.com/vercel-labs/agent-browser), [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp), [Playwright MCP](https://github.com/microsoft/playwright-mcp), [OpenAI computer use](https://developers.openai.com/api/docs/guides/tools-computer-use).

## Implementation design

The browser is one backend capability. The application owns workflow state and the meaning of a result.

Frontend request → durable job → equipment and guide resolver → verified part candidates → supplier adapters → evidence and offer validation → ranking → frontend results.

### A supplier adapter

Each adapter exposes a narrow set of operations: verify account context, establish branch or shipping location, search an identifier, read a candidate product, read fulfillment details, and collect evidence. The normal path uses explicit operations and stable locators. Verify the postcondition after every important operation: the intended query submitted, the requested branch selected, the expected product loaded, and the price panel finished loading.

On failure, capture the current page and try one bounded semantic recovery step. Revalidate the same postcondition afterward. If that fails, return a structured supplier error or reconnect request. Do not allow an unconstrained browser loop to continue searching indefinitely. Improvements discovered during recovery become reviewed adapter changes, rather than silently rewriting production code.

Use supplier APIs when documented and available. Where useful, inspect structured responses generated by the authorized page and tie them to visible product/account context; do not make unsupported private endpoints the only integration path.

### Model and guide resolution

Check the guide database before searching. Parse text-based guides once and retain applicability and page references. Use image extraction/OCR when needed. Do not repeatedly feed whole manuals into a browser agent. Model suffixes, serial splits, voltage, and ambiguous requested components require evidence or clarification.

### Session and account lifecycle

Create a persistent browser context per shop, supplier, and login. Let the user connect or reconnect through an authenticated application page that displays the hosted browser. The user can complete login or MFA inside that session. Pause automation while the user controls it, then verify the signed-in account and selected branch before resuming.

Serialize work that mutates the same supplier account context, especially location changes. Separate suppliers can run concurrently. Persisted cookies do not guarantee indefinite authentication: detect expiry and request reconnection. Protect context IDs/live-view links and redact credentials from prompts, logs, and recordings as supported by the selected provider.

Browserbase documents persistence of browser data, encryption at rest, manual login via Live View, and a recommendation to avoid concurrent sessions on the same context. Browser Use's local-to-cloud profile sync specifically transfers cookies, not all browser storage; that does not mean its cloud profiles lack persistence. Account migration must be tested rather than assumed.

Sources: [Browserbase contexts](https://docs.browserbase.com/platform/browser/core-features/contexts), [interactive Live View](https://docs.browserbase.com/platform/browser/observability/session-live-view), [Browser Use authentication notes](https://github.com/browser-use/browser-use#how-do-i-handle-authentication).

### Evidence and result correctness

Keep identity, price, availability, and execution status separate. A successful click is not a correct part match. A correctly shaped JSON response is not proof of its contents.

Every published offer needs supplier/account/location context, manufacturer and supplier identifiers, match category, observed time, price/currency/purchase unit, requested quantity, branch stock or explicit unknown, fulfillment information, source URL, and retained evidence where appropriate. Reject wrong dimensions, voltage, product category, and unsupported applicability. Preserve documented supersession chains and installation caveats. Alternatives permission is a durable application decision.

Code computes quantity conversions, cost comparisons, distance, and eligibility. A failed login or unavailable price panel becomes a supplier execution error, not a no-stock answer. Unknown shipping arrival cannot win fastest-arrival ranking. Purchases and cart operations are outside the initial sourcing worker's allowed actions.

## Cost comparison

Published prices checked October 17, 2026; they can change. Infrastructure prices do not establish cost per verified result.

| Service | Published price basis | Important additions |
| --- | --- | --- |
| Browserbase Developer | $20/month includes 100 browser-hours, then $0.12/browser-hour; 1 GB proxy traffic included, then $12/GB | Model usage, application compute/storage; managed Agent runs are a separate product allowance |
| Browser Use Cloud browsers | $0.02/browser-hour; residential proxy $5/GB | Agent service is model cost plus 20%, with browser time and traffic extra. Browser-only CDP usage is distinct from hosted agent usage |
| Skyvern | Hobby $29/month for 30,000 credits; Pro $149/month for 150,000 credits | Credit/action consumption must be measured for the actual workflow; these are not unlimited task plans |
| Local/self-hosted OSS | No SDK license fee for MIT tools | Browser compute, bandwidth/proxies where needed, model calls, storage, monitoring, upgrades, and engineering time remain |

Sources: [Browserbase pricing](https://www.browserbase.com/pricing), [Browser Use pricing](https://browser-use.com/pricing), [Skyvern pricing](https://www.skyvern.com/pricing).

Illustrative arithmetic, not measured performance: 1,000 requests × 3 suppliers × 2 minutes per supplier = 100 browser-hours. That is within Browserbase Developer's included hours or $2 in Browser Use browser time at the listed rate. This assumes two minutes per supplier for the whole request, not per part, and excludes guide lookup, retries, connection sessions, traffic, models, and application hosting.

At 10 GB of proxy traffic, Browserbase Developer's additional proxy charge would be $108 after its included 1 GB; Browser Use's listed residential proxy charge would be $50. Actual proxy use and transfer volume are unknown. This is why browser-hour price alone is insufficient.

Measure total variable cost divided by correctly completed requests, alongside explicit unresolved cases and supplier errors. Include failed attempts and retries in costs. Do not infer a cents-per-search promise from infrastructure pricing.

## Cost controls

- Routine navigation and known-field extraction should avoid model calls where possible.
- Reuse authenticated sessions and perform multiple part lookups in one supplier session; always close or release idle browsers.
- Use scoped page context for AI; reserve screenshots/vision for controls that require it.
- Cache guides, verified identifier mappings, branch coordinates, and reviewed navigation knowledge. Fresh price/stock reads remain separate.
- Stagehand v4 server-side caching requires Browserbase; it is not a portable local cache. Scoped calls bypass that result cache. Different variable values may miss, and cache reuse is not guaranteed across part numbers.
- Disable caching on credential-bearing calls. Initially disable result caching for volatile price/stock extraction; establish an explicit freshness policy before enabling any reuse.
- Apply per-supplier deadlines, attempt limits, and per-job cost limits. Track model tokens, browser minutes, transferred bytes, retries, and cache outcomes.
- Compare a smaller model with a stronger escalation model using the same saved cases; no model is selected as cheapest adequate until it passes.

Source: [Stagehand caching contract and limitations](https://docs.stagehand.dev/v4/best-practices/caching).

## Proof before adoption

Use the York E1RD036 control-board/capacitor workflow, including exact model applicability, against Johnstone, Parts Town, and public Grainger. Establish the manually reviewed expected result first. Compare a deterministic baseline, Stagehand hybrid, and Browser Use candidate on the same account/location/quantity context.

For a small initial comparison, run each candidate several times with fresh browser sessions and reused authentication; increase repetition for the winner and spread checks across days. Do not repeatedly hammer supplier pages. Exercise login expiry, a missing branch, a no-result search, alternative refusal, and a supplier timeout. Use saved evidence for much of the parser/validation regression work to avoid unnecessary paid/live runs.

Record verified field correctness, browser execution success, useful result coverage, honest unresolved outcomes, reconnect frequency, latency, model spend, browser/traffic spend, and human intervention. General vendor benchmarks and claims of self-healing are not supplier-specific acceptance evidence.

Proceed with Stagehand/Browserbase if it meets the workflow checks at acceptable total cost. Choose Browser Use if it delivers comparable correctness and operational recovery at lower measured cost. If both cloud browsers fail where normal Chrome works, investigate the actual account/network/browser difference. A narrowly scoped shop-side connector is a fallback deployment option, but introduces installation and online-device dependencies and should not be the starting architecture without evidence.

The next concrete engineering deliverable is a small, instrumented York sourcing worker and its API response—not a broad autonomous agent platform. This research does not justify buying subscriptions, changing credentials, or committing to a supplier success rate before testing.
