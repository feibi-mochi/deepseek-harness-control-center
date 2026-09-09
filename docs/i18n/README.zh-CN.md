# DeepSeek Harness Control Center

[![npm 版本](https://img.shields.io/npm/v/deepseek-harness-wallet?label=npm&color=5965d8)](https://www.npmjs.com/package/deepseek-harness-wallet)
[![GitHub Release](https://img.shields.io/github/v/release/feibi-mochi/deepseek-harness-control-center?label=release&color=5965d8)](https://github.com/feibi-mochi/deepseek-harness-control-center/releases)
[![构建检查](https://github.com/feibi-mochi/deepseek-harness-control-center/actions/workflows/validate.yml/badge.svg)](https://github.com/feibi-mochi/deepseek-harness-control-center/actions/workflows/validate.yml)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.5--alpha.1-4aa3ff)](https://github.com/deepseek-ai/DeepSeek-Harness)
[![MIT 许可证](https://img.shields.io/badge/license-MIT-3b7a57)](../../LICENSE)

**DeepSeek Harness 监控、提醒、充值与会话控制中心。**

`余额 ¥5.89 · 本场 ¥0.72 · 官 18.8M | 三方 800K · ↗ 充值`

[English](../../README.md) · [简体中文](./README.zh-CN.md) · [安装](#安装) · [兼容性](#浏览器桌面端与系统兼容) · [更新日志](../../CHANGELOG.md)

> 本地优先 DSH 助手：查看账户与本场用量、接收完成提醒、充值，并按宿主能力提供会话控制。

> **版本：** v0.3.13（未发布）。

> 如果 DeepSeek Harness Control Center 帮到了你，请考虑点一个 ⭐ Star，谢谢！

## 能做什么

钱包界面目前主要为中文，尚未跟随宿主语言设置（#32）。余额来自官方接口；费用统计是本机估算。

```
余额 ¥5.89 · 本场 ¥0.72 · 官 18.8M | 三方 800K · ↗充
```

- **官方 DeepSeek**——余额（60 秒全局刷新 + 启动快速重试）、本会话花费估算（不是官方账单；每次用量按发生时价格锁定，含 2026-08-17 峰谷价）、token 拆分。
- **视觉模型计费**——`deepseek-v4-flash-vision-exp` 按 V4 Flash 价格计费；Harness 上报的图片 token 会和文本 token 一起计入。
- **v4 峰谷计费时钟**——适用于 `v4-flash`、`v4-pro` 和 `v4-flash-vision-exp` 的 24 小时侧边栏环形钟。工作日高峰为北京时间 09:00–12:00、14:00–18:00；周五 18:00 后提示“周末全天低谷”，周六和周日分别显示当天全天低谷，周一 09:00 前显示剩余多久进入高峰。提醒逻辑将周五 18:00 至周一 09:00 视为一个连续低谷周期。
- **官方价格同步**——定期检查 DeepSeek 官方价格页，只有完整校验通过的价格表才会应用。网络失败时沿用上一次已验证规则（首次同步前使用内置规则）；页面结构无法识别时标记为待复核，不会静默修改计费。
- **Z.ai Coding Plan 套餐额度**——通过通用官方套餐适配器监控已配置的全球区和中国区套餐，不向浏览器暴露凭据；5 小时模型 Token 与月度 MCP 工具额度分开显示，以从 100% 向下消耗的剩余比例为主、已用比例为辅，查询失败保留最近成功数据，也不会把套餐额度换算成人民币余额。
- **跟随当前 Provider**——输入框标签和侧边栏时钟跟随当前会话选择的 Provider/模型。选择 Z.ai（包括透明的 `vision-toolkit-` 变体）后用套餐窗口摘要替代 DeepSeek 余额、充值和峰谷时钟；其他第三方仅显示自身会话 Token，切回 DeepSeek V4 后恢复钱包与峰谷视图。
- **本地用量账本（最多 365 天 / 20,000 条事件）**——钱包设置页常态显示热力图，紧凑钱包面板仍可折叠；稳定请求标识会去重，官方费用按发生时锁定，官方/第三方分开，且不保存提示词或回答正文。账本从升级到 v0.3.2 后开始收集，旧聚合数据没有可信日期，因此不会伪造回填。
- **第三方合计**——本会话 token（输入 / 缓存读 / 输出）保持零配置可用。
- **第三方自定义价格**——可按精确 Provider/模型填写币种及每百万 Token 的基础输入、缓存读、缓存写和输出价格，并可增加多个包含 IANA 时区、适用星期和跨午夜范围的分时段价格；本会话与 365 天账本会按用量发生时间在本机重新估算，并明确标注为自定义估算，不冒充第三方余额或账单。
- **Provider 分桶**——设置页会列出已观察到的包装路由；勾选后的后续调用计入官方 token/花费桶并按官方价格表计费，既有历史不会追溯重分桶。
- **点开面板**——按币种正确显示符号的余额拆分、花费与 token 明细、可自由填写当前账户与币种的低余额阈值（两位小数、按账户持久化；绝不跨币种比较或相加）、手动刷新、跳转官方充值页（首次点击显示域名确认，防钓鱼）。
- **移动、吸附与缩放**——标签可自由拖动，靠近目标区域时预览吸附位置，按空间切换紧凑横排或竖排；还可在控制面板中调整比例，并分别显示官方或第三方数据。峰谷时钟背景可明确选择“透明（悬停实色）”或“实色”，不提供自动模式。设置均保存在本地。
- **标签控制与皮肤兼容**——输入框标签可独立显示/隐藏，也可开启“仅显示余额”精简为首要剩余额度（DeepSeek 余额、Z.ai 五小时额度）；隐藏不会停止提醒、设置页、套餐监控或历史账本。标准样式会抵抗皮肤过宽的按钮规则，并与 maid-atelier 的 38px 深蓝金边工具栏对齐。
- **悬浮窗口**——明细面板可切换为位置记忆的拖动窗口，也可直接最小化为自由移动的圆点；低于阈值时圆点变红。
- **对话完成提醒**——可选择常驻或定时关闭；多个对话同时完成时自动排队、去重，并协调多个标签页；系统通知不可用时改用页面内提醒。
- **低余额提醒**——低于阈值时标签变红呼吸 + 桌面通知一次，余额回升后自动复位。
- **跟随主题**——使用 DSH `--dsw-alias-*` 主题变量并提供安全回退颜色，浅色/深色主题自动适配；面板点外部自动关闭，靠边自动反向展开。
- **清除本会话钱包数据**——一键只清当前对话的 token/花费记录，不会删除对话，其他会话也不受影响；清除历史账本是独立操作。

## 多账户

- 打开钱包面板 → **账户管理（Account Management）**，可添加账户（名称 + API Key）、切换当前账户或删除账户。
- 添加首个账户时会尝试同步到宿主凭证库；只有同步成功才激活。若宿主拒绝写入，账户会保留，但不会显示为当前计费账户。
- 切换会弹确认框，因为它会改变**后续 LLM 请求的计费**：切换把该账户 key 写入凭证库（`credentials.set('DEEPSEEK_API_KEY', ...)`），llm-deepseek 路由按请求解析该引用，因此**下一次 LLM 调用即用新账户计费，无需重启**。
- 账户 key 在 `$DSH_HOME/storages/accounts.json` 中加密保存：Windows 使用当前用户 DPAPI，其他系统使用仅限所有者访问的 AES-GCM 密钥文件。加密 `.bak` 可恢复缺失、损坏或无法解密的主文件；主备都不可读时锁定写入，避免覆盖账户。界面只显示掩码。
- 会话花费跟随当前账户货币：美元结算的账户显示「本约 $x」（按固定 7.25 CNY/USD 系数换算，并非实时汇率或官方美元单价）；人民币账户显示「本场 ¥x」。两者都是插件本地估算，不是官方账单。
- 若启动环境已提供 `DEEPSEEK_API_KEY`，切换会被明确拒绝（凭证提供方拒绝遮蔽写入）——在 shell 中取消该环境变量即可启用切换。


## 项目介绍

DeepSeek Harness Wallet 适合希望在对话时查看余额、比较模型开销，或管理多个账户的用户。输入框旁的标签显示当前模型对应的余额、套餐剩余额度或 Token 用量，点开可查看明细，也可拖成浮窗。设置页集中提供加密多账户、低余额与完成提醒、历史用量热力图，以及第三方 API 的固定或分时价格。DeepSeek 余额和 Z.ai 配额来自各自接口，费用则按宿主上报的用量在本机估算；它适合跟踪消耗，不代替供应商账单。

## 安装

从 npm 安装：

```sh
dsh plugin --profile web add deepseek-harness-wallet
```

或直接安装 GitHub `main`：

```sh
dsh plugin --profile web add github:feibi-mochi/deepseek-harness-control-center
```

重启 `dsh web`，然后强制刷新页面。

## 快速使用

1. 点击钱包卡片或峰谷卡片，打开控制面板；也可以打开 Harness 设置中的健康检查卡片。
2. 峰谷卡片支持横排/竖排和 100%–120% 缩放；钱包标签使用独立比例，输入框内为 100%–105%，停靠或浮动时最高 125%。
3. 如果需要缩小卡片，可以关闭官方充值按钮；官方和第三方数据也可以分别显示或隐藏。
4. 将卡片拖到任意空白位置。布局切换后如果不容易找到，可在面板中点击“归位/停靠”，恢复到侧边栏。
5. 卡片会跟随宿主的浅色/深色主题。升级后请强制刷新，确保加载新版前端。

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

本轮范围见 [0.3.13 兼容验证](https://github.com/feibi-mochi/deepseek-harness-control-center/blob/main/docs/compatibility-0.3.13.md)。官方 0.1.5-alpha.1 未提供本插件要求的永久删除能力，相关开关保持禁用；旧源码的会话删除补丁不能直接用于新版。

客户端没有按操作系统写死的功能分支，而是检查所需的 Web 与宿主能力；这让同一套代码容易迁移，但必须区分“具备兼容条件”和“已经在真机逐项验证”：

| 验证层级 | 范围 |
| --- | --- |
| 本轮本地验证 | Windows + Node 24.18.1 + DSH 0.1.5-alpha.1；无真实密钥的 Web 界面与隔离生命周期检查，未验证真实付费 API |
| 精确宿主覆盖 | 本次检查 0.1.5-alpha.1；此前 0.1.2-alpha.3/alpha.4/alpha.5/rc.1 的证据属于历史钱包版本，其他版本保持未验证 |
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

`notify()` 可以返回类通知句柄、返回其 Promise，也可以使用无需返回值的原生 API。载荷中的 `onClick` / `onClose` 让 Electron IPC、Tauri 通知等原生桥把点击和关闭事件传回钱包；返回 `false` 时钱包会改用浏览器回退。部分 Tauri 或 macOS 宿主可通过 `requestNotificationPermission()` 请求原生通知权限。`openExternal()` 返回 `false` 时钱包会继续尝试浏览器打开方式。只有宿主真正实现钱包开关和会话菜单动作时才能声明 `permanentDelete`；兼容宿主会自动声明，不兼容宿主显示禁用状态。所有平台差异集中在 `src/client/core.js` 的 `createCompatibilityAdapter()`；以后适配新的桌面壳时，不需要修改钱包计费与界面逻辑。

对于可以重新构建的 DSH 宿主，npm 包和仓库同时附带一套版本化的 [Agent 永久删除适配资料](../../integrations/dsh-session-delete/README.zh-CN.md)：包含中英文说明、完整 Agent 提示词、只读预检、兼容清单、上游声明和固定基线参考补丁。它不是通用安装器；DSH 提交不同就必须阅读现有源码并按语义迁移，封闭源码或不能重新构建的桌面端不在支持范围内。

## 可选宿主集成

永久删除会话不是钱包自身实现的功能。只有宿主提供对应能力时才开放开关；不支持的宿主保持禁用，官方 0.1.5-alpha.1 也不例外。需要自行适配时，参考[中文说明](../../integrations/dsh-session-delete/README.zh-CN.md)和[Agent 适配提示词](../../integrations/dsh-session-delete/AGENT_PROMPT.md)；旧参考补丁不能直接用于新版。

## 数据与安全

客户端开发源码位于 `src/client/` 的五个文件，`lib/client.js` 是已提交的加载产物。修改后运行 `npm ci`、`npm run build:client` 和 `npm run check:client`；安装时无需构建。各版本的隔离验证范围见 [0.3.10 兼容证据](https://github.com/feibi-mochi/deepseek-harness-control-center/blob/main/docs/compatibility-0.3.10.md)。

| 项目 | 行为 |
| --- | --- |
| Token 计费 | 监听 `llm/stream` 事件，按会话和 provider 分桶：`deepseek-official` 及明确勾选的包装路由进入官方桶，其他 provider 保持第三方桶；每次用量同时锁定当时的官方价格，会话与峰谷时段都不串账。 |
| 余额 | 钱包插件自身只直接把当前 key 作为 `Authorization` 头发往官方 `/user/balance` 接口。启用多账户切换后，所选 key 还会写入 DSH 凭证库；之后 DSH 可能使用它发起模型请求。 |
| 账户 | key 加密存于 `$DSH_HOME/storages/accounts.json`，加密的 `accounts.json.bak` 可恢复缺失、损坏或无法解密的主文件。Windows 使用当前用户 DPAPI；其他系统使用仅限所有者访问的 AES-GCM 密钥文件，迁移时必须把 `accounts.json`、`.bak` 和 `.key` 一起保存。主备都不可读时拒绝写入。 |
| 用量账本 | 本地事件和第三方自定义价格保存在 `$DSH_HOME/storages/wallet.json`，并保留 `wallet.json.bak`；主文件缺失或损坏时自动恢复，主备都不可读时拒绝覆盖。最多保留 365 天、20,000 条事件的会话/provider/模型/token 元数据与官方锁定费用，不保存提示词、工具参数、回答正文或 API Key；第三方费用按当前自定义规则和每条保留事件的发生时间重新估算，缺少时间信息的聚合用量安全回退到基础价。 |
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
- 2026-08-21 起——v4-flash-vision-exp 上线并采用 V4 Flash 峰谷价格：缓存读 0.05 / 0.10、输入 1.5 / 3、输出 4.5 / 9。
- 2026-08-23 北京时间 00:00 起——周六、周日不再区分峰谷，全天按低谷价格计费；工作日高峰时段仍为 9:00–12:00、14:00–18:00。

历史 deepseek-chat 与 deepseek-reasoner 记录继续使用原固定价格表；这不代表这些旧模型名当前仍可调用。每次用量在到达时计价；从 0.1.2 升级时，旧 token 记录会按升级时价格做一次迁移，此后不再随时段变化。花费为估算值，以官方接口返回的余额为准。

## Roadmap

- [x] 365 天 Token 热力图与可重建的本地历史账本
- [x] 基于通用官方套餐适配器的 Z.ai Coding Plan 全球区/中国区监控
- [x] 用户自定义第三方 Provider/模型基础价与分时价
- [ ] 其他供应商价格/余额适配器（只有完成真实账户验证后才标记支持）

## License

[MIT](../../LICENSE)
