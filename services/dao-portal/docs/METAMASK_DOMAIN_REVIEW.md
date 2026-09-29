# MetaMask domain classification — 29 September 2026

The MetaMask connection warning is reproducible through its public domain scanning API:

`GET https://dapp-scanning.api.cx.metamask.io/v2/scan?url=mythical-dao-preview.vercel.app`

Response: `{"hostname":"mythical-dao-preview.vercel.app","recommendedAction":"BLOCK"}`.

The current MetaMask PhishingController source uses this endpoint for URL classification. Its connection trust-signal gate shows the blocking modal when the displayed state is Malicious. The response does not disclose the underlying rule or threat-intelligence provider. A false positive is possible but has not been confirmed.

The current static GitHub `eth-phishing-detect/src/config.json` did not contain the exact domain or a blocked ancestor. This does not override the separate live API verdict. The entry JavaScript, theme script and CSS served by the deployment matched the local build byte for byte. That check is limited to those assets; it is not an independent security audit.

The supplied console messages contain extension-internal `moz-extension://` resources, missing `pt_PT` translations for `trustSignalBlockTitle`, and a CSP containing `wasm-unsafe-eval`. The portal's CSP is different. These extension diagnostics do not explain or clear the domain classification.

## Pending manual review

Use MetaMask's official support route for URL classification reviews:
https://support.metamask.io/configure/wallet/security-alerts/#how-to-report-a-false-classification

Suggested report (not sent):

> Please review the malicious-site classification for https://mythical-dao-preview.vercel.app. This is a test deployment of the Mythical DAO governance portal on Polygon (chain 137), published on 28 September 2026. On 29 September the MetaMask domain scan returned recommendedAction BLOCK and the extension showed “Malicious site detected” during wallet connection, before any transaction. Could you identify the relevant signal and review whether this is a false positive?
>
> The existing Governor/treasury is 0x7B9e327748462F1038c9D081c98d189b22C60A27. The proposed ragequit module is not deployed or enabled. Wallet connection uses Wagmi's injected connector. The portal does not request seed phrases, private keys or wallet passwords. Current transaction preflight is disabled because historical indexing is incomplete. The published entry assets match the local build. The warning screenshot and the attached domain diagnosis can be supplied for review.
>
> Project identity reference: https://mythicalbeings.io. The preview is a separate test hostname; ownership and its relationship to the project should be verified by the project's operator.

No report has been submitted, no wallet security settings changed, and no alternative deployment was created to bypass the warning. Do not proceed through Connect Anyway while the classification is unresolved.

Evidence: `evidence/metamask-domain-diagnosis.json`.

The earlier wallet test used a controlled EIP-1193 provider and did not test MetaMask's actual domain-reputation service. Deployment validation must include this check before inviting real-wallet connection tests.

## Follow-up comparison

Following the user's hypothesis about shared Vercel hostnames, the same live API returned BLOCK for all six tested `*.vercel.app` hostnames, including `react-tweet.vercel.app` (Vercel library documentation) and `next-learn-starter.vercel.app` (Next.js sample). Both control websites loaded normally. It returned NONE for `vercel.app`, `dao.mythicalbeings.io` and `example.com`.

This is strong evidence of a broad rule or classification affecting Vercel subdomains in the current service response. It does not establish a permanent universal MetaMask policy or disclose the underlying cause. The previous investigation was too narrow to distinguish this pattern. A review request should include these controls rather than assume a domain-specific finding. A project-owned staging hostname is an appropriate deployment configuration, but must be checked independently and is not a substitute for security validation. No hostname or wallet setting has been changed.

## Project-owned preview activated

Later on 29 September, the user authorized and enabled DNS configuration for `dao-preview.mythicalbeings.io`. The hostname now serves the isolated Vercel test project with validated TLS. A fresh MetaMask scan returned `NONE`; the actual extension opened its normal unlock screen when the portal requested a connection. Wallet unlocking/connection remains a user step. No warning was bypassed and no security setting was changed. The old Vercel hostname's classification has not been cleared by this change.
