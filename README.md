# DeepSeek Harness Control Center

### DeepSeek Harness monitoring, alerts, recharge, and session control center · DeepSeek Harness 监控、提醒、充值与会话控制中心

[English](./README.md) · [简体中文](https://github.com/feibi-mochi/deepseek-harness-control-center/blob/main/docs/i18n/README.zh-CN.md)

**Version:** 0.1.4 · **DeepSeek Harness:** 0.1.0-rc.6 · **License:** MIT

**A local-first monitoring and control companion for DeepSeek Harness Web.**

DeepSeek Harness can keep several conversations and model providers active at once, but the information needed to manage them is normally scattered: the official account balance is on one page, token usage is buried in stream events, a long-running conversation may finish in a background tab, and session cleanup is separate again. DeepSeek Harness Control Center brings those signals and controls into one small surface beside the composer while retaining `deepseek-harness-wallet` as its installation and compatibility identifier. It is designed to answer three everyday questions without interrupting the conversation: **How much official balance remains? What has this conversation used? Does anything need my attention?**

The resident chip combines the live DeepSeek balance, the open conversation's estimated official spend, official token usage, third-party token totals, and the official recharge shortcut. Accounting is isolated twice—by conversation and by provider—so one conversation cannot borrow another conversation's counters, and third-party traffic cannot become DeepSeek spend. Official cost is accumulated when each usage event arrives using the price active at that moment; later peak/off-peak changes therefore do not rewrite historical estimates. The detail panel expands this summary into per-currency balance rows, token splits, session spend, refresh controls, and a configurable CNY low-balance threshold.

Monitoring is paired with deliberate actions. A low balance changes the wallet's visual state and emits one alert until the balance recovers. The recharge shortcut always targets DeepSeek's fixed official top-up URL, and the first use shows the destination before leaving Harness. Completion reminders cover a different kind of waiting: they can remain until manually dismissed or close after a selected delay, combine simultaneous completions into a queue, coordinate across tabs, and open the relevant conversation when clicked. If a system notification cannot be shown, the same event falls back to an in-page notice instead of disappearing silently.

The interface is meant to live with the user's workspace rather than occupy it. The chip may remain in the composer, move freely, preview and snap to supported page edges or regions, switch between compact horizontal and vertical arrangements, scale from the control panel, or minimize directly to a movable dot. If the composer becomes too narrow for the full home chip, it keeps a clickable balance/token value instead of overflowing underneath the model selector. Official and third-party data can be shown independently while preventing an empty all-hidden state. The details panel itself is draggable and remembers its last position, and saved positions are fitted back into the viewport when the window changes.

Session controls keep two very different operations separate. **Clear current-session wallet data** removes only this plugin's balance-derived spend and token counters for the open conversation; it does not delete the conversation. **Permanent session deletion** is an optional host integration, not a deletion engine supplied by this npm package. It appears only when the current DSH host advertises a real deletion path, remains opt-in, and still requires confirmation; unsupported hosts keep the setting disabled. This boundary prevents a decorative switch from promising an operation the surrounding application cannot perform.

The trust model is intentionally narrow. The plugin registers no model tools, injects no prompt text, and adds no model-token overhead. Its host-side accounting is kept in the local DSH storage, while layout and reminder preferences use browser-compatible local storage. The existing DSH credential is used only for the official balance request, and recharge navigation is fixed to the official DeepSeek domain. The plugin does not collect payment details, estimate third-party money values without a price source, or merge balances across currencies.

Compatibility is based on capabilities rather than operating-system names. A normal DSH Web environment uses standards-based browser behavior; restricted Electron, Tauri, or other desktop shells can provide a small adapter for notifications, storage, and external links without changing accounting or UI logic. Optional features degrade visibly when a capability is absent. This keeps the project useful as a broader Harness monitoring and session-control center while leaving room for future provider adapters, history views, and other management features without changing the established npm package identity.

> If DeepSeek Harness Control Center helps you, please consider leaving a ⭐ Star. Thank you!

## What it does

```
余额 ¥5.89 · 本场 ¥0.72 · 官 18.8M | 三方 800K · ↗充
```

- **Official DeepSeek** — live balance (60s global refresh with fast boot retries), current-session cost locked to the price active for each usage event (including the 2026-08-17 peak/off-peak rollout), and token breakdown.
- **Third-party total** — current-session tokens (input / cache read / output). No balance guessing, no cost math, zero configuration.
- **Click the chip** to open the detail panel: correctly formatted per-currency balances, cost and token splits, a freely editable low-balance threshold in CNY (two decimals, persisted globally; alerts only compare a CNY balance and never mix currencies), manual refresh, and a jump to the official recharge page (first click shows the domain for confirmation — anti-phishing).
- **Move, dock, and scale** — drag the chip freely, preview nearby snap targets, use compact horizontal or vertical layouts, adjust its scale from the control panel, and show official or third-party data independently. The choices are remembered locally.
- **Floating window mode** — detach the detail panel into a draggable window with a remembered position, or minimize it directly to a freely movable dot; the dot turns red below the threshold.
- **Completion reminders** — optionally notify when a conversation finishes, with persistent or timed modes, queueing and deduplication for simultaneous completions, cross-tab coordination, and an in-page fallback when system notifications are unavailable.
- **Optional permanent deletion** — when the DSH host advertises a real deletion capability, an opt-in setting enables a confirmed permanent-delete action in the session menu; unsupported hosts keep the control disabled.
- **Low-balance alert** — below the threshold the chip turns red with a breathing animation and fires one desktop notification; it resets automatically once the balance recovers.
- **Theme-native UI** — built entirely on `--dsw-alias-*` theme variables, so light and dark themes both render correctly; the panel closes when you click outside and flips open-direction near screen edges.
- **Clear current-session wallet data** — one button clears only the open conversation's token/cost records; it does not delete the conversation, and every other conversation is untouched.

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
| Balance | The `DEEPSEEK_API_KEY` from the credentials seam never leaves this machine except as the `Authorization` header of the official `/user/balance` request. |
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
