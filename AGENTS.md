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
dsh plugin --profile web add github:feibi-mochi/deepseek-harness-wallet
```

Then **restart `dsh web` and hard-refresh the page** — the client half injects on page load; without a hard refresh the chip will not appear.

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

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Chip missing after install | Page not hard-refreshed, or `dsh web` not restarted after install. |
| Balance shows an error | `DEEPSEEK_API_KEY` missing/invalid. The key only leaves the machine as the `Authorization` header to the official `/user/balance` endpoint. |
| Third-party sessions show no balance | By design — no balance API for third-party providers; only token totals are tracked. |
| Session cost looks off | Costs are estimates from the official pricing timeline (peak/off-peak since 2026-08-17); the API-returned balance is authoritative. |
| Plugin data | `$DSH_HOME/storages/wallet.json`. "清除本会话" clears only the open conversation. |

## Hard constraints — do not do these

- Never hand-edit the profile's `cordis.patch.yml` to insert this plugin — the package already declares `dsh.bundle.patch`; manual insertion duplicates the loader id and breaks loading.
- Never change or "generalize" the hardcoded recharge URL (`https://platform.deepseek.com/top_up`) — it is hardcoded on purpose as an anti-phishing measure.
- The plugin registers no model tools and injects no prompt content; keep it that way.
