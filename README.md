# DeepSeek Harness Balance Monitor & Recharge Plugin

### 余额监控和充值插件

<p align="center">
  <a href="./README.md"><strong>English</strong></a> ·
  <a href="./docs/i18n/README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img alt="Version 0.1.0" src="https://img.shields.io/badge/version-0.1.0-5965d8">
  <img alt="DeepSeek Harness Web" src="https://img.shields.io/badge/DeepSeek%20Harness-Web-4aa3ff">
  <img alt="Zero runtime dependencies" src="https://img.shields.io/badge/runtime%20dependencies-0-3b7a57">
  <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-3b7a57">
  <a href="https://github.com/feibi-mochi/deepseek-harness-wallet/actions/workflows/validate.yml"><img alt="Validate" src="https://github.com/feibi-mochi/deepseek-harness-wallet/actions/workflows/validate.yml/badge.svg"></a>
</p>

<p align="center">
  <strong>Know your balance, session spend and token usage before the next request—and jump to the official DeepSeek recharge page in one click.</strong>
</p>

`dsh-wallet` is a focused wallet chip built specifically for the official [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web interface. It keeps the numbers that matter beside the composer: official DeepSeek balance, estimated spend for the open session, official and third-party token totals, a configurable low-balance warning, and a guarded shortcut to the official recharge page.

<p align="center">
  <img alt="DeepSeek Harness wallet control panel" src="./docs/assets/panel.png" width="980">
</p>

<p align="center">
  If this plugin saves you a surprise balance error, please consider leaving a ⭐ Star. It helps other DeepSeek Harness users discover the project.
</p>

## Why this exists

Long agent sessions can consume millions of tokens while the account balance remains hidden on another website. `dsh-wallet` puts the answer directly in the Harness workflow without adding a model tool, changing the system prompt or spending another token.

```text
余额 5.89 · 本场 0.72 · 官 18.8M | 三方 800K · ↗充
```

## Core features

- **Live DeepSeek balance** — reads the official account-balance endpoint, refreshes every 60 seconds and provides a manual refresh button.
- **Per-session spend monitor** — estimates the open conversation's DeepSeek cost from cache-hit input, cache-miss input and output usage. The displayed balance remains the authoritative account value.
- **Provider-aware token tracking** — keeps official DeepSeek usage separate from third-party providers, so another provider's tokens never inflate the DeepSeek bill.
- **Official recharge shortcut** — opens `https://platform.deepseek.com/top_up`. The destination is hardcoded and shown for confirmation before the first jump.
- **Low-balance alert** — choose any threshold with two-decimal precision. Below it, the chip turns red and sends one desktop notification; the alert resets after the balance recovers.
- **Conversation isolation** — each session has its own counters. “Clear current session” removes only the open conversation's wallet data.
- **Theme-native panel** — follows Harness light and dark themes, closes on outside click and flips direction near the viewport edge.
- **No model overhead** — no tools, no prompt injection and no extra model tokens.

## Screenshots

| Below threshold: red alert | Above threshold: normal state |
| --- | --- |
| ![Below-threshold wallet chip](./docs/assets/below-threshold.png) | ![Normal wallet chip](./docs/assets/above-threshold.png) |

## Install from GitHub

Requirements:

- The official DeepSeek Harness Web profile
- Node.js `^22.19.0` or `>=24`
- A configured `DEEPSEEK_API_KEY` for official balance lookup

```shell
dsh plugin --profile web add github:feibi-mochi/deepseek-harness-wallet
dsh --profile web
```

Then hard-refresh the Harness page. The wallet chip appears beside the composer.

### Update

```shell
dsh plugin --profile web update dsh-wallet
```

### Remove

```shell
dsh plugin --profile web remove dsh-wallet
```

> [!NOTE]
> Token tracking works per provider. Official balance lookup requires a valid DeepSeek API key with access to the official balance endpoint. The recharge action opens DeepSeek's website; login and payment always happen there.

## Data, privacy and trust

| Item | Behavior |
| --- | --- |
| API key | Read through the Harness credentials service. It is sent only as the authorization header for `https://api.deepseek.com/user/balance`; the plugin never displays or stores the key. |
| Wallet data | Stored locally at `$DSH_HOME/storages/wallet.json`. |
| Token accounting | Listens to Harness `llm/stream` usage data and buckets it by session and provider. |
| Model surface | Registers no model tool and injects no prompt content. |
| Recharge | Opens only the hardcoded official URL `https://platform.deepseek.com/top_up`. |

## Pricing used for estimates

The current V4 table uses CNY per one million tokens from the official [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/) page:

| Model | Cache-hit input | Cache-miss input | Output |
| --- | ---: | ---: | ---: |
| `deepseek-v4-flash` | ¥0.02 | ¥1 | ¥2 |
| `deepseek-v4-pro` | ¥0.025 | ¥3 | ¥6 |

Prices can change. Treat the session amount as an estimate and the balance returned by DeepSeek as authoritative. Please open an Issue when the official pricing table changes.

## Project layout

```text
dsh-wallet/
├─ index.js                 Host plugin: balance, usage accounting and HTTP routes
├─ lib/client.js            Harness Web wallet chip and control panel
├─ cordis.patch.yml         Installable Harness profile bundle patch
├─ docs/assets/             Public screenshots
└─ docs/i18n/README.zh-CN.md
```

## Roadmap

- [ ] Balance history chart
- [ ] Optional pricing tables for third-party providers
- [ ] Balance adapters for additional providers
- [ ] More automated compatibility checks against Harness releases

## Contributing

Bug reports and pull requests are welcome in English or Chinese. Never include API keys, wallet files, session logs or account information in an Issue.

## Disclaimer

This is an independent community plugin and is not affiliated with or endorsed by DeepSeek. DeepSeek and DeepSeek Harness are trademarks or projects of their respective owners.

## License

[MIT](./LICENSE)
