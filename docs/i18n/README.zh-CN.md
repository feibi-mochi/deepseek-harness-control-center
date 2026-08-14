# DeepSeek Harness Balance Monitor & Recharge Plugin

### 余额监控和充值插件

<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="./README.zh-CN.md"><strong>简体中文</strong></a>
</p>

<p align="center">
  <img alt="版本 0.1.0" src="https://img.shields.io/badge/version-0.1.0-5965d8">
  <img alt="DeepSeek Harness Web" src="https://img.shields.io/badge/DeepSeek%20Harness-Web-4aa3ff">
  <img alt="零运行依赖" src="https://img.shields.io/badge/runtime%20dependencies-0-3b7a57">
  <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-3b7a57">
  <a href="https://github.com/feibi-mochi/deepseek-harness-wallet/actions/workflows/validate.yml"><img alt="自动检查" src="https://github.com/feibi-mochi/deepseek-harness-wallet/actions/workflows/validate.yml/badge.svg"></a>
</p>

<p align="center">
  <strong>发送下一条请求前，就在 Harness 内看清余额、本会话花费与 token 用量，并一键跳转 DeepSeek 官方充值页。</strong>
</p>

`dsh-wallet` 是专门为官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 界面制作的钱包标签。它把真正需要的数字放到输入框旁：官方 DeepSeek 余额、当前会话预估花费、官方与第三方 token 合计、可配置的低余额提醒，以及带首次确认的官方充值入口。

<p align="center">
  <img alt="DeepSeek Harness 钱包控制面板" src="../assets/panel.png" width="980">
</p>

<p align="center">
  如果它帮你避开了一次“余额不足”，欢迎点一个 ⭐ Star，让更多 DeepSeek Harness 用户找到这个项目。
</p>

## 为什么做这个插件

长时间的 Agent 任务可能消耗数百万 token，但账户余额仍藏在另一个网页里。`dsh-wallet` 直接在 Harness 工作流里给出答案，同时不注册模型工具、不修改系统提示词，也不会多消耗一个 token。

```text
余额 5.89 · 本场 0.72 · 官 18.8M | 三方 800K · ↗充
```

## 核心功能

- **实时 DeepSeek 余额**——读取官方账户余额接口，每 60 秒自动刷新，也可手动刷新。
- **单会话花费监控**——按缓存命中输入、缓存未命中输入和输出 token 估算当前会话的 DeepSeek 花费；账户余额仍以 DeepSeek 返回值为准。
- **按供应商分桶统计**——官方 DeepSeek 与第三方供应商分别累计，其他模型的 token 不会被算进 DeepSeek 账单。
- **官方充值跳转**——只打开 `https://platform.deepseek.com/top_up`，地址不可自定义；首次跳转前会显示域名确认。
- **低余额提醒**——阈值可自由设置到两位小数。低于阈值时标签变红并发送一次桌面通知，余额恢复后自动复位。
- **会话隔离**——每个会话独立计数；“清除本会话数据”只影响当前对话。
- **跟随 Harness 主题**——自动适配浅色与深色主题，点击外部关闭面板，靠近屏幕边缘时自动调整展开方向。
- **零模型负担**——不注册工具、不注入提示词、不增加模型 token。

## 截图

| 低于阈值：红色提醒 | 高于阈值：正常状态 |
| --- | --- |
| ![低于阈值的钱包标签](../assets/below-threshold.png) | ![正常的钱包标签](../assets/above-threshold.png) |

## 从 GitHub 安装

要求：

- 官方 DeepSeek Harness Web profile
- Node.js `^22.19.0` 或 `>=24`
- 已配置 `DEEPSEEK_API_KEY`，用于查询官方余额

```shell
dsh plugin --profile web add github:feibi-mochi/deepseek-harness-wallet
dsh --profile web
```

随后强制刷新 Harness 页面，钱包标签会出现在输入框旁。

### 更新

```shell
dsh plugin --profile web update dsh-wallet
```

### 卸载

```shell
dsh plugin --profile web remove dsh-wallet
```

> [!NOTE]
> Token 会按供应商正常统计；官方余额查询需要有效的 DeepSeek API Key。充值按钮只负责打开 DeepSeek 官方网站，登录和支付始终在官方页面完成。

## 数据、隐私与信任

| 项目 | 行为 |
| --- | --- |
| API Key | 通过 Harness 凭证服务读取，只作为授权头发送到 `https://api.deepseek.com/user/balance`；插件不会显示或保存 Key。 |
| 钱包数据 | 仅保存在本机 `$DSH_HOME/storages/wallet.json`。 |
| Token 统计 | 监听 Harness `llm/stream` 用量数据，按会话与供应商分别累计。 |
| 模型侧 | 不注册模型工具，不注入任何提示词。 |
| 充值 | 只打开硬编码的官方地址 `https://platform.deepseek.com/top_up`。 |

## 花费估算价格

当前 V4 价格表使用 DeepSeek 官方[模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)页面公布的人民币/百万 token 单价：

| 模型 | 缓存命中输入 | 缓存未命中输入 | 输出 |
| --- | ---: | ---: | ---: |
| `deepseek-v4-flash` | ¥0.02 | ¥1 | ¥2 |
| `deepseek-v4-pro` | ¥0.025 | ¥3 | ¥6 |

官方价格可能调整。当前会话花费应视为估算，DeepSeek 返回的账户余额才是权威值。官方价格变化后，欢迎提交 Issue。

## 项目结构

```text
dsh-wallet/
├─ index.js                 宿主插件：余额、用量统计与 HTTP 路由
├─ lib/client.js            Harness Web 钱包标签和控制面板
├─ cordis.patch.yml         可安装的 Harness profile bundle 补丁
├─ docs/assets/             公开展示截图
└─ docs/i18n/README.zh-CN.md
```

## 计划

- [ ] 余额历史曲线
- [ ] 可选的第三方供应商价格表
- [ ] 更多供应商余额接口适配
- [ ] 针对 Harness 新版本的自动兼容性检查

## 参与贡献

欢迎使用英文或中文提交 Bug 与 PR。请勿在 Issue 中上传 API Key、钱包文件、会话日志或账户信息。

## 声明

这是独立的社区插件，与 DeepSeek 官方没有隶属或背书关系。DeepSeek 与 DeepSeek Harness 的相关权利归其各自所有者。

## 许可证

[MIT](../../LICENSE)
