# DeepSeek Harness Control Center

[![npm version](https://img.shields.io/npm/v/deepseek-harness-wallet?label=npm&color=5965d8)](https://www.npmjs.com/package/deepseek-harness-wallet)
[![GitHub release](https://img.shields.io/github/v/release/feibi-mochi/deepseek-harness-control-center?label=release&color=5965d8)](https://github.com/feibi-mochi/deepseek-harness-control-center/releases)
[![CI](https://github.com/feibi-mochi/deepseek-harness-control-center/actions/workflows/validate.yml/badge.svg)](https://github.com/feibi-mochi/deepseek-harness-control-center/actions/workflows/validate.yml)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-4aa3ff)](https://github.com/deepseek-ai/DeepSeek-Harness)
[![License: MIT](https://img.shields.io/badge/license-MIT-3b7a57)](./LICENSE)

**DeepSeek Harness monitoring, alerts, recharge, and session control center.**

`Balance ¥5.89 · Session ¥0.72 · Official 18.8M | Third-party 800K · ↗ Recharge`

[English](./README.md) · [简体中文](https://github.com/feibi-mochi/deepseek-harness-control-center/blob/main/docs/i18n/README.zh-CN.md) · [Install](#install) · [Compatibility](#browser-desktop-and-os-compatibility) · [Changelog](./CHANGELOG.md)

> A local-first companion that keeps account status, per-conversation usage, completion reminders, official recharge, flexible layout, and host-gated session controls beside the DSH composer.

> If DeepSeek Harness Control Center helps you, please consider leaving a ⭐ Star. Thank you!

## What it does

```
余额 ¥5.89 · 本场 ¥0.72 · 官 18.8M | 三方 800K · ↗充
```

- **Official DeepSeek** — live balance (60s global refresh with fast boot retries), current-session cost locked to the price active for each usage event (including the 2026-08-17 peak/off-peak rollout), and token breakdown.
- **24h peak/off-peak ring clock** — resident sidebar footer widget indicating real-time pricing windows (peak vs. 50% discount off-peak), countdown to next switch, and optional desktop switch notifications.
- **Third-party total** — current-session tokens (input / cache read / output). No balance guessing, no cost math, zero configuration.
- **Click the chip** to open the detail panel: correctly formatted per-currency balances, cost and token splits, a freely editable low-balance threshold in CNY (two decimals, persisted globally; alerts only compare a CNY balance and never mix currencies), manual refresh, and a jump to the official recharge page (first click shows the domain for confirmation — anti-phishing).
- **Move, dock, and scale** — drag the chip freely, preview nearby snap targets, use compact horizontal or vertical layouts, adjust its scale from the control panel, and show official or third-party data independently. The choices are remembered locally.
- **Floating window mode** — detach the detail panel into a draggable window with a remembered position, or minimize it directly to a freely movable dot; the dot turns red below the threshold.
- **Completion reminders** — optionally notify when a conversation finishes, with persistent or timed modes, queueing and deduplication for simultaneous completions, cross-tab coordination, and an in-page fallback when system notifications are unavailable.
- **Optional permanent deletion** — when the DSH host advertises a real deletion capability, an opt-in setting enables a confirmed permanent-delete action in the session menu; unsupported hosts keep the control disabled.
- **Low-balance alert** — below the threshold the chip turns red with a breathing animation and fires one desktop notification; it resets automatically once the balance recovers.
- **Theme-native UI** — built entirely on `--dsw-alias-*` theme variables, so light and dark themes both render correctly; the panel closes when you click outside and flips open-direction near screen edges.
- **Clear current-session wallet data** — one button clears only the open conversation's token/cost records; it does not delete the conversation, and every other conversation is untouched.
## Multi-account

- Open the wallet panel → **账户管理** to add accounts (name + API key), switch the active one, or remove them.
- The first account added becomes the active account automatically and is synced into the credentials seam.
- Switching prompts a confirmation because it changes **LLM billing** for subsequent requests: the switch writes the account key into the credentials seam (`credentials.set('DEEPSEEK_API_KEY', ...)`), and since the llm-deepseek provider route resolves that reference per request, the very next LLM call is billed with the new account — no restart needed.
- Account keys are stored plaintext in `$DSH_HOME/storages/accounts.json`; the UI only ever shows masked keys. Balance lookups prefer the active account's key and fall back to the credentials seam when no account is active.
- Session cost follows the active account's currency: USD-settled accounts show `本约 $x` — a clearly-labeled estimate converted from the CNY price table at the vendor's long-standing list ratio (not a live FX rate); CNY accounts show the exact `本场 ¥x`.
- If `DEEPSEEK_API_KEY` is supplied by the launching environment, switching is refused with a clear error (the credentials provider rejects shadowed writes) — unset it in your shell to enable switching.


## Project overview

### One place for the signals that matter

DeepSeek Harness can keep several conversations and model providers active at once, but balance, usage, background-task status, and session actions normally live in different places. Control Center brings the information worth checking repeatedly beside the composer, so the current workflow can answer three questions at a glance: **How much official balance remains? What has this conversation used? Does anything need attention?**

### Present when needed, quiet when not

The project is designed around quick reading and in-context action rather than another full-page dashboard. Its compact surface expands only when needed, adapts to the available space, and leaves layout and reminder behavior under the user's control. Accounting remains separated by conversation and provider, while wallet-data cleanup and permanent session deletion remain intentionally different operations.

### Extensible without hiding the boundaries

The npm package handles monitoring and interface behavior; optional host powers are enabled only when DSH actually provides them. That capability-based boundary keeps unsupported actions visibly unavailable and gives browsers or desktop wrappers a small, reviewable adaptation surface. Future providers and controls can therefore be added without changing the established `deepseek-harness-wallet` package identity or silently expanding what the plugin is trusted to do.

> **Want permanent session deletion?** It cannot be enabled by configuring the plugin alone. Give the [integration guide](./integrations/dsh-session-delete/README.md) and [Agent adaptation prompt](./integrations/dsh-session-delete/AGENT_PROMPT.md) to an Agent with access to the buildable DSH source. The control-panel switch becomes available only after the host implementation is built, tested, and advertises the capability.

Details: [compatibility](#browser-desktop-and-os-compatibility) · [data and trust](#data--trust) · [pricing](#pricing-timeline)

## Install

From npm:

```sh
dsh plugin --profile web add deepseek-harness-wallet
```

or from GitHub directly:

```sh
dsh plugin --profile web add github:feibi-mochi/deepseek-harness-control-center
```

Restart `dsh web`, then hard-refresh the page.

### Update

```sh
dsh plugin --profile web update deepseek-harness-wallet
```

### Remove

```sh
dsh plugin --profile web remove deepseek-harness-wallet
```

> The package was renamed from `dsh-wallet` to `deepseek-harness-wallet` in 0.1.1. If you installed the old name, remove it with `dsh plugin --profile web remove dsh-wallet` first.

## Browser, desktop, and OS compatibility

The client contains no operating-system-specific feature branch; it checks the Web and host capabilities it needs. That makes the same code portable, but **portable code is not the same as real-device verification**:

| Verification level | Coverage |
| --- | --- |
| Real environment checked for this release | Windows + current Edge + DSH Web |
| Automated compatibility checks | Browser notification failure, in-page fallback, cross-tab fallback, storage fallback, CSS-scale fallback, and synchronous/asynchronous desktop adapters |
| Capability-compatible targets | Current Chrome, Edge, and Firefox on Windows/macOS/Linux; Safari on macOS; Electron/Tauri-style DSH wrappers that provide the requirements below |

The last row describes intended compatibility, not a claim that every browser/OS/wrapper combination was physically tested. If system notifications are unavailable or denied, reminders fall back to an in-page notice; if Web Locks are unavailable, a renewable local-storage lease coordinates reminder ownership across tabs. CSS `zoom` also has a transform fallback. Core wallet data, controls, dragging, docking, scaling, and visibility settings use these shared paths rather than an OS name check.

Electron, Tauri, and other DSH desktop wrappers can run the wallet when they expose the normal DSH Web plugin loader, slots, wallet HTTP endpoints, DOM, and `fetch`. A wrapper that restricts native notifications, persistent storage, or external links may define one optional adapter before the plugin bundle loads:

```js
window.__DSH_WALLET_ADAPTER__ = {
  // All fields are optional. Keep storage synchronous and localStorage-compatible.
  storage: { getItem, setItem, removeItem },
  notify({ title, body, tag, requireInteraction, onClick, onClose }) {
    // May return a notification-like handle, Promise, or nothing.
    // Call the supplied onClick/onClose callbacks for native events.
  },
  requestNotificationPermission() { return 'granted' },
  openExternal(url) { return true },
  capabilities: { permanentDelete: true },
}
```

`notify()` may return a notification-like handle, a Promise for one, or nothing for fire-and-forget native APIs. The payload also includes `onClick` / `onClose` callbacks so Electron IPC, Tauri notification actions, and other desktop bridges can return events without copying wallet logic; returning `false` asks the wallet to use its browser fallback. `requestNotificationPermission()` is optional for hosts such as Tauri and macOS that require a native permission request. Returning `false` from `openExternal()` likewise asks the wallet to try the browser fallback. Declare `permanentDelete` only when the host actually implements the wallet preference and session-menu action; compatible hosts advertise it automatically, while unsupported hosts show a disabled control instead of a switch that has no effect. Platform adaptations are intentionally confined to `createCompatibilityAdapter()` in `lib/client.js`, so an Agent can add a new wrapper without editing wallet accounting or UI logic.

For buildable DSH hosts, the npm package and repository include a versioned [Agent-assisted permanent-delete integration kit](./integrations/dsh-session-delete/README.md) with a Chinese guide, complete Agent prompt, read-only preflight, compatibility manifest, upstream notice, and an exact-baseline reference patch. The patch is not a universal installer: a different DSH commit must be inspected and adapted by semantics, and closed or non-rebuildable desktop applications remain unsupported.

## Data & trust

| Item | Behavior |
| --- | --- |
| Token accounting | Listens to the `llm/stream` event and buckets per provider (`deepseek-official` vs. everything else) and per session; each usage event also locks its contemporaneous official price, so multiple sessions and pricing windows never mix. |
| Balance | The key from the credentials seam (or the active account's key) never leaves this machine except as the `Authorization` header of the official `/user/balance` request. |
| Accounts | Keys live in `$DSH_HOME/storages/accounts.json` (plaintext, matching the harness's own credential storage); the UI only ever shows masked keys, and switching writes the chosen key into the credentials seam for LLM billing. |
| Session log | The plugin writes no events; its data lives in `$DSH_HOME/storages/wallet.json`. |
| Local settings | Layout, scale, visibility, reminder, and panel settings stay in browser-compatible local storage. |
| Permanent deletion | Opt-in and host-gated. The wallet never advertises the action unless the host implements the matching session deletion path. |
| Model surface | No tools registered, no prompt injection, zero token cost. |
| Recharge | The URL is hardcoded to the official `https://platform.deepseek.com/top_up` and is not user-configurable (anti-phishing). |

## Pricing timeline

CNY per 1M tokens, curated from official announcements (cache writes are not billed):

- Since 2025-02-09 — deepseek-chat 2/8 (cache read 0.5), deepseek-reasoner 4/16 (cache read 1)
- Since 2026-04-24 — v4-flash 1/2 (cache read 0.02), v4-pro 3/6 (cache read 0.025)
- Since 2026-08-17 00:00 Beijing — peak/off-peak pricing for the v4 models (peak windows Beijing 09:00–12:00 / 14:00–18:00; off-peak is half the peak rate):
  - v4-flash (off-peak / peak): cache read 0.05 / 0.10, input 1.5 / 3, output 4.5 / 9
  - v4-pro (off-peak / peak): cache read 0.15 / 0.30, input 4.5 / 9, output 13.5 / 27

deepseek-chat and deepseek-reasoner keep their flat rates. Each usage event is priced when it arrives; upgrading from 0.1.2 migrates legacy counters once using the then-current rate. Costs are estimates; the API-returned balance is authoritative.

## Roadmap

- [ ] Third-party price tables (cost per token)
- [ ] Balance history chart
- [ ] Balance-API adapters for other providers (e.g. Zhipu)

## License

[MIT](LICENSE)
