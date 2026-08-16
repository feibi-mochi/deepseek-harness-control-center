# DeepSeek Harness Control Center

[![npm 版本](https://img.shields.io/npm/v/deepseek-harness-wallet?label=npm&color=5965d8)](https://www.npmjs.com/package/deepseek-harness-wallet)
[![GitHub Release](https://img.shields.io/github/v/release/feibi-mochi/deepseek-harness-control-center?label=release&color=5965d8)](https://github.com/feibi-mochi/deepseek-harness-control-center/releases)
[![构建检查](https://github.com/feibi-mochi/deepseek-harness-control-center/actions/workflows/validate.yml/badge.svg)](https://github.com/feibi-mochi/deepseek-harness-control-center/actions/workflows/validate.yml)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-4aa3ff)](https://github.com/deepseek-ai/DeepSeek-Harness)
[![MIT 许可证](https://img.shields.io/badge/license-MIT-3b7a57)](../../LICENSE)

**DeepSeek Harness 监控、提醒、充值与会话控制中心。**

`余额 ¥5.89 · 本场 ¥0.72 · 官 18.8M | 三方 800K · ↗ 充值`

[English](../../README.md) · [简体中文](./README.zh-CN.md) · [安装](#安装) · [兼容性](#浏览器桌面端与系统兼容) · [更新日志](../../CHANGELOG.md)

> 一个以本地数据为主、常驻输入框旁的 DSH 助手：集中查看账户状态与本会话用量，接收完成提醒，前往官方充值，并按宿主能力提供会话控制。

> 如果 DeepSeek Harness Control Center 帮到了你，请考虑点一个 ⭐ Star，谢谢！

## 能做什么

```
余额 ¥5.89 · 本场 ¥0.72 · 官 18.8M | 三方 800K · ↗充
```

- **官方 DeepSeek**——余额（60 秒全局刷新 + 启动快速重试）、本会话花费（每次用量按发生时价格锁定，含 2026-08-17 峰谷价）、token 拆分。
- **第三方合计**——本会话 token（输入 / 缓存读 / 输出）。不算钱、不猜余额、零配置。
- **点开面板**——按币种正确显示符号的余额拆分、花费与 token 明细、可自由填写的低余额阈值（人民币、两位小数、全局持久化；仅在有人民币余额时提醒，绝不跨币种比较或相加）、手动刷新、跳转官方充值页（首次点击显示域名确认，防钓鱼）。
- **移动、吸附与缩放**——标签可自由拖动，靠近目标区域时预览吸附位置，按空间切换紧凑横排或竖排；还可在控制面板中调整比例，并分别显示官方或第三方数据。设置均保存在本地。
- **悬浮窗口**——明细面板可切换为位置记忆的拖动窗口，也可直接最小化为自由移动的圆点；低于阈值时圆点变红。
- **对话完成提醒**——可选择常驻或定时关闭；多个对话同时完成时自动排队、去重，并协调多个标签页；系统通知不可用时改用页面内提醒。
- **可选的永久删除**——只有 DSH 宿主真正提供会话删除能力时，用户才可主动开启并在二次确认后永久删除；不支持的环境保持禁用。
- **低余额提醒**——低于阈值时标签变红呼吸 + 桌面通知一次，余额回升后自动复位。
- **跟随主题**——全部使用 `--dsw-alias-*` 主题变量，浅色/深色主题自动适配；面板点外部自动关闭，靠边自动反向展开。
- **清除本会话钱包数据**——一键只清当前对话的 token/花费记录，不会删除对话，其他会话也不受影响。

## 项目介绍

### 把重要信息收回对话旁边

DeepSeek Harness 可以同时运行多个对话并接入不同模型，但余额、用量、后台任务状态和会话操作通常散落在不同位置。Control Center 把值得反复查看的信息放在输入框旁，让用户不用离开当前工作流，就能快速回答三个问题：**官方余额还剩多少？当前对话用了多少？现在有没有事情需要处理？**

### 需要时出现，平时不打扰

这个项目追求的是随手查看、就地操作，而不是再造一个占满页面的后台。紧凑标签只在需要时展开，并根据可用空间调整形态；布局和提醒方式由用户决定。统计按对话和供应商隔离，“清除钱包数据”与“永久删除会话”也始终保持为两种不同操作。

### 可以扩展，但不隐藏能力边界

npm 插件负责监控与界面行为；需要宿主配合的能力，只有在 DSH 确实提供时才会开启。按能力判断而不是按系统名称猜测，既能让不支持的操作明确保持不可用，也为浏览器和桌面壳保留一处小而可审查的适配入口。以后增加新的供应商或控制功能时，也不必改变既有的 `deepseek-harness-wallet` 包标识，或悄悄扩大插件获得的权限。

> **需要永久删除会话？** 这不是在插件里改个配置就能启用的功能。请把[中文适配教程](../../integrations/dsh-session-delete/README.zh-CN.md)和[Agent 适配提示词](../../integrations/dsh-session-delete/AGENT_PROMPT.md)交给能够访问目标 DSH 源码的 Agent；宿主完成实现、构建与验证并声明能力后，控制面板才会开放开关。

详细说明：[兼容性](#浏览器桌面端与系统兼容) · [数据与安全](#数据与安全) · [价格](#价格时间线)

## 安装

从 npm 安装：

```sh
dsh plugin --profile web add deepseek-harness-wallet
```

或直接从 GitHub 安装：

```sh
dsh plugin --profile web add github:feibi-mochi/deepseek-harness-control-center
```

重启 `dsh web`，然后强制刷新页面。

### 更新

```sh
dsh plugin --profile web update deepseek-harness-wallet
```

### 卸载

```sh
dsh plugin --profile web remove deepseek-harness-wallet
```

> 包名在 0.1.1 从 `dsh-wallet` 改为 `deepseek-harness-wallet`。如果之前装的是旧包名，请先执行 `dsh plugin --profile web remove dsh-wallet` 移除旧版，避免两份副本同时注册 UI。

## 浏览器、桌面端与系统兼容

客户端没有按操作系统写死的功能分支，而是检查所需的 Web 与宿主能力；这让同一套代码容易迁移，但必须区分“具备兼容条件”和“已经在真机逐项验证”：

| 验证层级 | 范围 |
| --- | --- |
| 本版已完成真实环境检查 | Windows + 当前版 Edge + DSH Web |
| 已完成自动兼容测试 | 系统通知失败、页面内提醒、跨标签页回退、本地存储回退、CSS 比例回退，以及同步/异步桌面端适配器 |
| 按能力设计的兼容目标 | Windows/macOS/Linux 上当前版 Chrome、Edge、Firefox，macOS Safari，以及满足下列条件的 Electron/Tauri 类 DSH 桌面端 |

最后一行表示代码具备兼容路径，并不等于每一种浏览器、系统和桌面壳组合都已经做过真机验证。系统通知不可用或被拒绝时会改用页面内提醒；不支持 Web Locks 时以可续期的本地存储租约协调多个标签页；CSS `zoom` 不可用时改用 `transform`。余额与 token、控制面板、拖动吸附、比例缩放和显示开关都走这些共用路径，而不是依赖某个系统名称。

Electron、Tauri 等 DSH 桌面端只要完整提供 DSH Web 插件加载器、插槽、钱包 HTTP 接口、DOM 和 `fetch`，即可运行本插件。如果桌面壳限制系统通知、持久存储或外部链接，可在钱包脚本加载前提供一个全部字段均可选的统一适配器：

```js
window.__DSH_WALLET_ADAPTER__ = {
  // storage 必须同步并兼容 localStorage；不需要的字段可以不写。
  storage: { getItem, setItem, removeItem },
  notify({ title, body, tag, requireInteraction, onClick, onClose }) {
    // 可返回类通知句柄、Promise，或由原生端自行处理而不返回值。
    // 原生通知被点击或关闭时，调用 onClick / onClose。
  },
  requestNotificationPermission() { return 'granted' },
  openExternal(url) { return true },
  capabilities: { permanentDelete: true },
}
```

`notify()` 可以返回类通知句柄、返回其 Promise，也可以使用无需返回值的原生 API。载荷中的 `onClick` / `onClose` 让 Electron IPC、Tauri 通知等原生桥把点击和关闭事件传回钱包；返回 `false` 时钱包会改用浏览器回退。部分 Tauri 或 macOS 宿主可通过 `requestNotificationPermission()` 请求原生通知权限。`openExternal()` 返回 `false` 时钱包会继续尝试浏览器打开方式。只有宿主真正实现钱包开关和会话菜单动作时才能声明 `permanentDelete`；兼容宿主会自动声明，不兼容宿主显示禁用状态。所有平台差异集中在 `lib/client.js` 的 `createCompatibilityAdapter()`；以后适配新的桌面壳时，不需要修改钱包计费与界面逻辑。

对于可以重新构建的 DSH 宿主，npm 包和仓库同时附带一套版本化的 [Agent 永久删除适配资料](../../integrations/dsh-session-delete/README.zh-CN.md)：包含中英文说明、完整 Agent 提示词、只读预检、兼容清单、上游声明和固定基线参考补丁。它不是通用安装器；DSH 提交不同就必须阅读现有源码并按语义迁移，封闭源码或不能重新构建的桌面端不在支持范围内。

## 数据与安全

| 项目 | 行为 |
| --- | --- |
| Token 计费 | 监听 `llm/stream` 事件，按 provider 分桶（`deepseek-official` 之外全部归第三方）、按会话隔离；每次用量同时锁定当时的官方价格，会话与峰谷时段都不串账。 |
| 余额 | 凭证库 `DEEPSEEK_API_KEY` 只在本机流转，仅作为 `Authorization` 头发往官方 `/user/balance` 接口。 |
| 会话日志 | 插件不写入任何事件；数据存于 `$DSH_HOME/storages/wallet.json`。 |
| 本地设置 | 布局、比例、数据显隐、提醒和面板位置保存在兼容浏览器的本地存储中。 |
| 永久删除 | 默认关闭并受宿主能力限制；宿主未实现真实会话删除链路时，插件不会开放该操作。 |
| 模型可见性 | 不注册工具、不注入提示词、零 token 消耗。 |
| 充值 | 地址硬编码为官方 `https://platform.deepseek.com/top_up`，不可配置（防钓鱼）。 |

## 价格时间线

CNY/百万 token，整理自官方公告（缓存写入不计费）：

- 2025-02-09 起——deepseek-chat 2/8（缓存读 0.5）、deepseek-reasoner 4/16（缓存读 1）
- 2026-04-24 起——v4-flash 1/2（缓存读 0.02）、v4-pro 3/6（缓存读 0.025）
- 2026-08-17 北京时间 00:00 起——v4 模型实行峰谷定价（高峰为北京时间 9:00–12:00 / 14:00–18:00；空闲时段价格为高峰的一半）：
  - v4-flash（空闲 / 高峰）：缓存读 0.05 / 0.10、输入 1.5 / 3、输出 4.5 / 9
  - v4-pro（空闲 / 高峰）：缓存读 0.15 / 0.30、输入 4.5 / 9、输出 13.5 / 27

deepseek-chat 与 deepseek-reasoner 维持固定价格。每次用量在到达时计价；从 0.1.2 升级时，旧 token 记录会按升级时价格做一次迁移，此后不再随时段变化。花费为估算值，以官方接口返回的余额为准。

## Roadmap

- [ ] 第三方价格表（按 token 折算花费）
- [ ] 余额历史曲线
- [ ] 更多供应商的余额接口适配（如智谱）

## License

[MIT](../../LICENSE)
