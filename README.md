# DeepSeek Harness Control Center

[![npm version](https://img.shields.io/npm/v/deepseek-harness-wallet?label=npm&color=5965d8)](https://www.npmjs.com/package/deepseek-harness-wallet)
[![GitHub release](https://img.shields.io/github/v/release/feibi-mochi/deepseek-harness-control-center?label=release&color=5965d8)](https://github.com/feibi-mochi/deepseek-harness-control-center/releases)
[![CI](https://github.com/feibi-mochi/deepseek-harness-control-center/actions/workflows/validate.yml/badge.svg)](https://github.com/feibi-mochi/deepseek-harness-control-center/actions/workflows/validate.yml)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.1--rc.2-4aa3ff)](https://github.com/deepseek-ai/DeepSeek-Harness)
[![License: MIT](https://img.shields.io/badge/license-MIT-3b7a57)](./LICENSE)

**DeepSeek Harness monitoring, alerts, recharge, and session control center.**

`Balance ¥5.89 · Session ¥0.72 · Official 18.8M | Third-party 800K · ↗ Recharge`

[English](./README.md) · [简体中文](https://github.com/feibi-mochi/deepseek-harness-control-center/blob/main/docs/i18n/README.zh-CN.md) · [Install](#install) · [Compatibility](#browser-desktop-and-os-compatibility) · [Changelog](./CHANGELOG.md)

> A local-first companion that keeps account status, per-conversation usage, completion reminders, official recharge, flexible layout, and host-gated session controls beside the DSH composer.

> **Version:** v0.3.6 is the current local patch candidate; v0.3.5 remains the published stable release on GitHub and npm until release approval.

> If DeepSeek Harness Control Center helps you, please consider leaving a ⭐ Star. Thank you!

## What it does

```
余额 ¥5.89 · 本场 ¥0.72 · 官 18.8M | 三方 800K · ↗充
```

- **Official DeepSeek** — live balance (60s global refresh with fast boot retries), an estimated current-session cost (not an official bill) locked to the price active for each usage event, including the 2026-08-17 peak/off-peak rollout, and token breakdown.
- **Vision model accounting** — `deepseek-v4-flash-vision-exp` is priced like V4 Flash; image tokens reported by the Harness are included with text tokens.
- **v4 peak/off-peak ring clock** — a resident 24-hour sidebar footer widget for `v4-flash`, `v4-pro`, and `v4-flash-vision-exp`. Weekday peak windows are 09:00–12:00 and 14:00–18:00 Beijing time. After Friday 18:00 the card previews “weekend all-day off-peak”; Saturday and Sunday name the current all-day off-peak rule; Monday before 09:00 shows the time remaining to enter peak. Optional notifications treat Friday 18:00 through Monday 09:00 as one continuous off-peak period.
- **Official pricing sync** — periodically checks the official DeepSeek pricing page and applies only a fully validated table. Network failures retain the last validated rule (or the built-in rule before the first successful sync); an unrecognized page structure is marked for review instead of silently changing billing.
- **Z.ai Coding Plan quotas** — a generic official-plan adapter monitors configured Global and China plans without exposing credentials. It separates the 5-hour model-token window from monthly MCP-tool usage, leads with quota remaining from 100% down while keeping usage as secondary context, retains the last successful snapshot on failure, and never converts subscription quota into CNY balance.
- **Provider-aware composer surfaces** — the chip and sidebar clock follow the session's selected provider/model. Z.ai replaces DeepSeek balance, recharge, and peak pricing with plan-window summaries; unrelated providers show only their own session tokens, and DeepSeek V4 restores the wallet and peak clock.
- **365-day local usage ledger** — Wallet settings keeps the heatmap visible, while compact wallet panels keep it collapsible. Stable request identities are deduplicated, official cost is locked at usage time, official and third-party data stay separate, and prompts or responses are never stored. Collection begins after upgrading to v0.3.2; older aggregate counters have no trustworthy dates and are not backfilled.
- **Third-party total** — current-session tokens (input / cache read / output). No balance guessing, no cost math, zero configuration.
- **Provider classification** — observed wrapper routes appear in the settings page; opted-in routes join the official token/cost bucket for subsequent calls and are priced with the official table. Existing history is not retroactively reclassified.
- **Click the chip** to open the detail panel: correctly formatted per-currency balances, cost and token splits, a freely editable low-balance threshold for the active account and currency (two decimals, persisted per account; alerts never mix currencies), manual refresh, and a jump to the official recharge page (first click shows the domain for confirmation — anti-phishing).
- **Move, dock, and scale** — drag the chip freely, preview nearby snap targets, use compact horizontal or vertical layouts, adjust its scale from the control panel, and show official or third-party data independently. The peak clock background can be explicitly set to transparent (solid on hover) or solid; there is no automatic mode. The choices are remembered locally.
- **Composer-label controls and skin compatibility** — independently show/hide the composer label or reduce it to the primary remaining value (DeepSeek balance, Z.ai five-hour quota) without disabling reminders, settings, plan monitoring, or history. The standard chip also resists broad skin button rules and aligns with maid-atelier's 38px navy-and-gold composer toolbar.
- **Floating window mode** — detach the detail panel into a draggable window with a remembered position, or minimize it directly to a freely movable dot; the dot turns red below the threshold.
- **Completion reminders** — optionally notify when a conversation finishes, with persistent or timed modes, queueing and deduplication for simultaneous completions, cross-tab coordination, and an in-page fallback when system notifications are unavailable.
- **Optional permanent deletion** — when the DSH host advertises a real deletion capability, an opt-in setting enables a confirmed permanent-delete action in the session menu; unsupported hosts keep the control disabled.
- **Low-balance alert** — below the threshold the chip turns red with a breathing animation and fires one desktop notification; it resets automatically once the balance recovers.
- **Theme-native UI** — uses DSH `--dsw-alias-*` variables with safe fallback colors, so light and dark themes both render correctly; the panel closes when you click outside and flips open-direction near screen edges.
- **Clear current-session wallet data** — one button clears only the open conversation's token/cost records; it does not delete the conversation, and every other conversation is untouched. Historical ledger clearing is a separate action.

## Multi-account

- Open the wallet panel → **Account Management（账户管理）** to add accounts (name + API key), switch the active one, or remove them.
- The first account added becomes the active account automatically and is synced into the credentials seam.
- Switching prompts a confirmation because it changes **LLM billing** for subsequent requests: the switch writes the account key into the credentials seam (`credentials.set('DEEPSEEK_API_KEY', ...)`), and since the llm-deepseek provider route resolves that reference per request, the very next LLM call is billed with the new account — no restart needed.
- Account keys are encrypted at rest in `$DSH_HOME/storages/accounts.json`: Windows uses the current user's DPAPI; other platforms use an owner-only AES-GCM key file. An encrypted `.bak` recovers a missing, corrupt, or undecryptable primary file; if neither copy can be read, writes are locked instead of overwriting account data. The UI only shows masked keys.
- Session usage estimates follow the active account's currency: USD-settled accounts show `本约 $x`, converted from the CNY price table at the vendor's long-standing list ratio (not a live FX rate); CNY accounts show `本场 ¥x`. These are local estimates, not an official invoice.
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

From npm (published stable v0.3.5; v0.3.6 is the local patch candidate until release approval):

```sh
dsh plugin --profile web add deepseek-harness-wallet
```

or from GitHub `main` (published v0.3.5 source until release approval):

```sh
dsh plugin --profile web add github:feibi-mochi/deepseek-harness-control-center
```

Restart `dsh web`, then hard-refresh the page.

## Quick use

1. Click the wallet or peak/off-peak card to open its control panel; open the Harness settings card for health and compatibility checks.
2. The peak card supports horizontal/vertical layout and 100%–120% scaling. The wallet chip uses a separate scale: 100%–105% in the composer and up to 125% when docked or floating.
3. Turn the official recharge button off when you need a smaller card; official and third-party rows can also be shown independently.
4. Drag the card to any open area. If it is hard to find after a layout change, use **Reset/Dock（归位/停靠）** in the panel to return it to the sidebar.
5. The card follows the host light/dark theme. A hard refresh after upgrading makes sure the new client bundle is loaded.

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
| Token accounting | Listens to the `llm/stream` event and buckets per session and provider: `deepseek-official` plus explicitly opted-in wrapper routes use the official bucket; other providers stay third-party; each usage event also locks its contemporaneous official price, so multiple sessions and pricing windows never mix. |
| Balance | The wallet plugin itself sends the active key directly only to the official `/user/balance` endpoint. When multi-account switching is enabled, the selected key is also written into the DSH credentials seam; DSH may then use it for subsequent model requests. |
| Accounts | Keys live encrypted in `$DSH_HOME/storages/accounts.json`, with an encrypted `accounts.json.bak` fallback for a missing, corrupt, or undecryptable primary. Windows uses current-user DPAPI; other platforms use an owner-only AES-GCM key file, so move `accounts.json`, `.bak`, and `.key` together. If neither copy can be read, account writes fail closed. |
| Usage ledger | Local events live in `$DSH_HOME/storages/wallet.json` with a `wallet.json.bak` recovery copy. Missing/corrupt primaries recover automatically; if neither copy is readable, wallet writes fail closed. Up to 365 days of session/provider/model/token metadata and locked cost are kept—never prompts, tool arguments, or response bodies. |
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
- Since 2026-08-21 — v4-flash-vision-exp launched with the V4 Flash peak/off-peak table: cache read 0.05 / 0.10, input 1.5 / 3, output 4.5 / 9.
- Since 2026-08-23 00:00 Beijing — Saturday and Sunday are no longer split into peak/off-peak windows; weekend calls use the off-peak rates all day. Weekday peak windows remain 09:00–12:00 and 14:00–18:00.

Historical deepseek-chat and deepseek-reasoner records retain their original flat-rate table; this is not a claim that those legacy model names remain currently available. Each usage event is priced when it arrives; upgrading from 0.1.2 migrates legacy counters once using the then-current rate. Costs are estimates; the API-returned balance is authoritative.

## Roadmap

- [x] 365-day Token heatmap and rebuildable local usage ledger
- [x] Z.ai Coding Plan Global/China monitoring on a generic official-plan adapter contract
- [ ] Additional provider price/balance adapters only after real-account validation

## License

[MIT](LICENSE)
