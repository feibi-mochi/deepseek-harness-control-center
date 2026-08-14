# dsh-wallet

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./docs/i18n/README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img alt="Version 0.1.1" src="https://img.shields.io/badge/version-0.1.1-5965d8">
  <img alt="DeepSeek Harness rc.6" src="https://img.shields.io/badge/dsh-0.1.0--rc.6-4aa3ff">
  <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-3b7a57">
</p>

**The multi-provider wallet chip for the DeepSeek Harness Web GUI.**

A resident one-line chip beside the composer: official DeepSeek money (balance, session cost, tokens, one-click recharge, low-balance alert) plus the third-party token total. Accounting is bucketed per provider — a GLM session never shows a DeepSeek balance, and DeepSeek costs are never computed from GLM tokens.

<p align="center">
  If dsh-wallet helps you, please consider leaving a ⭐ Star. Thank you!
</p>

## What it shows

```
余额 5.89 · 本场 0.72 · 官 18.8M | 三方 800K · ↗充
```

- **Official DeepSeek** — live balance (60s global refresh with fast boot retries), current-session cost (official pricing timeline, including the 2026-08-17 peak/off-peak rollout), and token breakdown.
- **Third-party total** — current-session tokens (input / cache read / output). No balance guessing, no cost math, zero configuration.
- **Click the chip** to open the detail panel: per-currency balance breakdown, cost and token splits, a freely editable low-balance threshold (two decimals, persisted globally), manual refresh, and a jump to the official recharge page (first click shows the domain for confirmation — anti-phishing).
- **Floating window mode** — from the detail panel, detach the wallet into a floating window you can drag anywhere (position remembered across reloads), or minimize it to a small dot; the dot turns red below the threshold.
- **Low-balance alert** — below the threshold the chip turns red with a breathing animation and fires one desktop notification; it resets automatically once the balance recovers.
- **Theme-native UI** — built entirely on `--dsw-alias-*` theme variables, so light and dark themes both render correctly; the panel closes when you click outside and flips open-direction near screen edges.
- **Clear current session** — one button clears only the open conversation's token/cost records; every other conversation is untouched.

### Screenshots

| Floating window (draggable) | Minimized dot | Below threshold (alert on) | Above threshold (normal) |
| --- | --- | --- | --- |
| <img alt="Floating wallet window" src="docs/assets/floating-window.png" width="340"> | <img alt="Minimized floating dot" src="docs/assets/floating-dot.png" width="340"> | <img alt="Below threshold" src="docs/assets/below-threshold.png" width="340"> | <img alt="Above threshold" src="docs/assets/above-threshold.png" width="340"> |

## Install

```sh
dsh plugin --profile web add github:feibi-mochi/deepseek-harness-wallet
```

Restart `dsh web`, then hard-refresh the page.

## Data & trust

| Item | Behavior |
| --- | --- |
| Token accounting | Listens to the `llm/stream` event and buckets per provider (`deepseek-official` vs. everything else) and per session; multiple sessions never mix accounts. |
| Balance | The `DEEPSEEK_API_KEY` from the credentials seam never leaves this machine except as the `Authorization` header of the official `/user/balance` request. |
| Session log | The plugin writes no events; its data lives in `$DSH_HOME/storages/wallet.json`. |
| Model surface | No tools registered, no prompt injection, zero token cost. |
| Recharge | The URL is hardcoded to the official `https://platform.deepseek.com/top_up` and is not user-configurable (anti-phishing). |

## Pricing timeline

CNY per 1M tokens, curated from official announcements (cache writes are not billed):

- Since 2025-02-09 — deepseek-chat 2/8 (cache read 0.5), deepseek-reasoner 4/16 (cache read 1)
- Since 2026-05-22 — v4-flash 1/2 (cache read 0.02), v4-pro 3/6 (cache read 0.025)
- Since 2026-08-17 — peak/off-peak (Beijing 09:00–12:00 / 14:00–18:00 peak)

## Roadmap

- [ ] Third-party price tables (cost per token)
- [ ] Balance history chart
- [ ] Balance-API adapters for other providers (e.g. Zhipu)

## License

[MIT](LICENSE)
