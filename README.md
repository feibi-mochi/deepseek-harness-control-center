# deepseek-harness-wallet

### DeepSeek Harness Balance Monitor & Recharge Plugin · 余额监控和充值插件

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./docs/i18n/README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img alt="Version 0.1.3" src="https://img.shields.io/badge/version-0.1.3-5965d8">
  <img alt="DeepSeek Harness rc.6" src="https://img.shields.io/badge/dsh-0.1.0--rc.6-4aa3ff">
  <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-3b7a57">
</p>

**The multi-provider wallet chip for the DeepSeek Harness Web GUI.**

A resident one-line chip beside the composer: official DeepSeek (balance, session cost, tokens, one-click recharge, low-balance alert) plus the third-party token total. Accounting is bucketed per provider — a GLM session never shows a DeepSeek balance, and DeepSeek costs are never computed from GLM tokens.

<p align="center">
  If deepseek-harness-wallet helps you, please consider leaving a ⭐ Star. Thank you!
</p>

## What it shows

```
余额 ¥5.89 · 本场 ¥0.72 · 官 18.8M | 三方 800K · ↗充
```

- **Official DeepSeek** — live balance (60s global refresh with fast boot retries), current-session cost locked to the price active for each usage event (including the 2026-08-17 peak/off-peak rollout), and token breakdown.
- **Third-party total** — current-session tokens (input / cache read / output). No balance guessing, no cost math, zero configuration.
- **Click the chip** to open the detail panel: correctly formatted per-currency balances, cost and token splits, a freely editable low-balance threshold in CNY (two decimals, persisted globally; alerts only compare a CNY balance and never mix currencies), manual refresh, and a jump to the official recharge page (first click shows the domain for confirmation — anti-phishing).
- **Floating window mode** — from the detail panel, detach the wallet into a floating window you can drag anywhere (position remembered across reloads), or minimize it to a small dot; the dot turns red below the threshold.
- **Low-balance alert** — below the threshold the chip turns red with a breathing animation and fires one desktop notification; it resets automatically once the balance recovers.
- **Theme-native UI** — built entirely on `--dsw-alias-*` theme variables, so light and dark themes both render correctly; the panel closes when you click outside and flips open-direction near screen edges.
- **Clear current session** — one button clears only the open conversation's token/cost records; every other conversation is untouched.

### Screenshots

| Floating window (draggable) | Minimized dot | Below threshold (alert on) | Above threshold (normal) |
| --- | --- | --- | --- |
| <img alt="Floating wallet window" src="docs/assets/floating-window.png" width="340"> | <img alt="Minimized floating dot" src="docs/assets/floating-dot.png" width="340"> | <img alt="Below threshold" src="docs/assets/below-threshold.png" width="340"> | <img alt="Above threshold" src="docs/assets/above-threshold.png" width="340"> |

## Install

From npm:

```sh
dsh plugin --profile web add deepseek-harness-wallet
```

or from GitHub directly:

```sh
dsh plugin --profile web add github:feibi-mochi/deepseek-harness-wallet
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

## Data & trust

| Item | Behavior |
| --- | --- |
| Token accounting | Listens to the `llm/stream` event and buckets per provider (`deepseek-official` vs. everything else) and per session; each usage event also locks its contemporaneous official price, so multiple sessions and pricing windows never mix. |
| Balance | The `DEEPSEEK_API_KEY` from the credentials seam never leaves this machine except as the `Authorization` header of the official `/user/balance` request. |
| Session log | The plugin writes no events; its data lives in `$DSH_HOME/storages/wallet.json`. |
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
