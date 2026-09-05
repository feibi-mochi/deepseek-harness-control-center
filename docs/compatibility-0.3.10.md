# Wallet 0.3.10 compatibility evidence

Checked on 2026-09-05 using Windows and Node 24.18.1. No real DSH profiles or credentials were copied to the test environments.

| Official DSH release | Package install | Web cold start and wallet routes | Remove and restart | Roll back to wallet 0.3.9 |
| --- | --- | --- | --- | --- |
| 0.1.2-alpha.4 | Passed | Passed | Passed | Passed |
| 0.1.2-alpha.5 | Passed | Passed | Passed | Passed |
| 0.1.2-rc.1 | Passed | Passed | Passed | Passed |

Each CLI was installed into a separate directory with matching exact DSH package overrides. Each run created a disposable `DSH_HOME`, installed the packed wallet using the official `plugin --profile web add` CLI, started Web, checked the wallet health and preferences endpoints, retrieved its registered client bundle, removed the plugin, restarted and verified the wallet was absent, then installed and cold-started wallet 0.3.9. The observed host version matched the intended release in every run.

Reproduce with `node scripts/verify-dsh-profile.mjs <pinned-cli-root> <0.3.10.tgz> <0.3.9.tgz> <unused-port>`.

These checks establish installation, activation, resource delivery, removal and rollback. They do not establish live paid-API billing or an independent security audit. Existing renderer/accounting regression tests run against the committed distribution bundle; platform-specific account encryption remains covered by the Windows/macOS/Linux CI matrix. Alpha.3 local deployment and Edge checks are reported separately.

## Source and distribution

The readable client is divided into `src/client/core.js`, `styles.js`, `views.js`, `settings.js`, and `wallet.js`. `scripts/build-client.mjs` combines them into the existing module-loader wrapper and removes whitespace/comments with pinned esbuild 0.25.9. Identifiers and expressions are preserved, and no dynamic evaluation or encoded source is added. Every source file and the committed `lib/client.js` remain below the store's 262144-byte per-file limit. `npm run check:client` verifies reproducibility and `test/distribution.test.mjs` enforces the bound.

Installation still has no lifecycle scripts or runtime dependencies. Development uses `npm ci`, `npm run build:client`, `npm run check:client`, `npm test`, and `npm run check:pack`.

The store's `dshReleases` matrix is an author compatibility declaration. Catalog acceptance, independent review, and store-controlled re-listing are separate external outcomes; this document does not claim they have occurred.
