# AGENTS.md

Instructions for AI agents (e.g. a DeepSeek Harness session) asked to install, verify, or troubleshoot **deepseek-harness-wallet** on the user's machine. Human-readable docs: [README](./README.md).

## What this is

A zero-dependency, zero-build DeepSeek Harness Web plugin: a wallet chip beside the composer showing official DeepSeek balance, per-session cost and token usage (bucketed per provider), low-balance alerts, a guarded official recharge link, and a draggable floating window / minimized dot mode. Plain JavaScript — no build step, no runtime dependencies.

## Prerequisites to check first

1. Official DeepSeek Harness runtime (`dsh` / `dsh web`), Web profile.
2. Node.js `^22.19.0 || >=24` (declared in `engines`; install fails on older Node).
3. `DEEPSEEK_API_KEY` configured in the harness credentials seam — required only for balance lookup. Token/cost tracking works without it; balance shows an error state instead.

## Install

```sh
dsh plugin --profile web add deepseek-harness-wallet
```

(The npm registry is the primary channel; fall back to `github:feibi-mochi/deepseek-harness-control-center` when npm is unavailable.)

Then **restart `dsh web` and hard-refresh the page** — the client half injects on page load; without a hard refresh the chip will not appear.

**Boot failure note (pre-0.1.2)**: if the page fails with `client-modules: bundle ... loaded without registering "deepseek-harness-wallet"`, the machine has the broken 0.1.1 build (client half registered the old `dsh-wallet` loader id). Fix: `dsh plugin --profile web remove deepseek-harness-wallet`, restart, then install ≥0.1.2 from npm and hard-refresh.

## Verify after install

1. A one-line chip appears beside the composer, e.g. `余额 5.89 · 本场 0.72 · 官 18.8M | 三方 800K · ↗充`.
2. Clicking the chip opens the detail panel; the `◳ 浮动` button detaches it into a draggable floating window; `–` minimizes it to a dot; `×` returns to chip mode. Position and mode persist in localStorage.
3. Send one message in the conversation — token counters must increase.

## Update / remove

```sh
dsh plugin --profile web update deepseek-harness-wallet
dsh plugin --profile web remove deepseek-harness-wallet
```

The package was renamed from `dsh-wallet` to `deepseek-harness-wallet` in 0.1.1. If a machine still has the old `dsh-wallet` package installed, remove it (`dsh plugin --profile web remove dsh-wallet`) to avoid two copies registering the same UI row.

## Release discipline

- Do not commit, push, tag, create a GitHub Release, or publish to npm without an explicit user confirmation in the current task. Local changes and verification may be completed first, but the release step must wait for approval.
- Treat maintenance and incremental feature work as patch updates whenever possible. The current stable release is `0.3.5`; the next small release is `0.3.6`. Never publish a lower version afterward.
- Before requesting release approval, report the exact version, test result, local deployment status, and the GitHub/npm actions that are still pending.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Chip missing after install | Page not hard-refreshed, or `dsh web` not restarted after install. |
| Balance shows an error | `DEEPSEEK_API_KEY` missing/invalid. The plugin sends the active key directly only to the official `/user/balance` endpoint; account switching also writes the selected key into the Harness credentials seam for subsequent model requests. |
| Third-party sessions show no balance | By design — no balance API for third-party providers; only token totals are tracked. |
| Session cost looks off | Costs are estimates from the official pricing timeline (peak/off-peak since 2026-08-17); the API-returned balance is authoritative. |
| Plugin data | Usage data: `$DSH_HOME/storages/wallet.json` with `wallet.json.bak`. Encrypted accounts: `$DSH_HOME/storages/accounts.json` with encrypted `accounts.json.bak`; non-Windows AES also requires `accounts.json.key`. Both stores recover from valid backups and fail closed when primary and backup are unreadable. "清除本会话" clears only the open conversation. |

## Platform adaptation

Keep OS/browser/desktop-wrapper differences inside `createCompatibilityAdapter()` in `lib/client.js`. Do not add Electron, Tauri, Windows, macOS, or Linux branches to wallet accounting, polling, layout, or React rendering. A wrapper may provide the optional synchronous `window.__DSH_WALLET_ADAPTER__` fields documented in README; standards-based browser fallbacks must continue to work when the adapter is absent. Add adapter-focused tests for any new wrapper capability. Never advertise `capabilities.permanentDelete` unless the host implements the matching preference and session-menu action.

Permanent deletion is a host integration, not a capability implemented by this npm plugin. For a buildable DSH source tree, start with [`integrations/dsh-session-delete/README.md`](./integrations/dsh-session-delete/README.md) and its pinned reference patch. On a different DSH commit, port the documented invariants by semantics; never force-apply the patch or fake the capability signal.

## Hard constraints — do not do these

- Never hand-edit the profile's `cordis.patch.yml` to insert this plugin — the package already declares `dsh.bundle.patch`; manual insertion duplicates the loader id and breaks loading.
- Never change or "generalize" the hardcoded recharge URL (`https://platform.deepseek.com/top_up`) — it is hardcoded on purpose as an anti-phishing measure.
- The plugin registers no model tools and injects no prompt content; keep it that way.
