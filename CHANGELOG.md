# Changelog

All notable changes to this project are documented in this file.

## 0.3.3 - 2026-08-23

- 新增通用官方套餐适配器契约，并首批接入 Z.ai Coding Plan 全球区与中国区；每个来源固定绑定官方域名和独立的 DSH 凭据引用，浏览器不会收到 Key、接口路径或原始响应。 / Added a generic official subscription-plan adapter contract with initial Z.ai Coding Plan Global and China adapters; each source is pinned to its official domain and its own DSH credential reference, while the browser receives no key, endpoint path, or raw response.
- 套餐页分别显示 5 小时模型 Token 额度与月度 MCP 工具额度，以从 100% 向下消耗的剩余比例为主，已用比例和可用时的已用/总量为辅，并显示重置时间、套餐等级、更新时间和来源域名；剩余不高于 50% 变黄、不高于 20% 变红，也不把套餐额度换算成人民币余额。 / The plan view separates the 5-hour model-token window from monthly MCP-tool quota, leading with remaining percentage that drains from 100% while retaining used percentage and available used/total values; it also shows reset time, plan level, update time, and source domain, turns yellow at 50% remaining and red at 20%, and never converts quota into currency.
- 后台按来源独立解析凭据、5 分钟缓存并合并并发刷新；网络失败保留最近成功快照并标记缓存，401、限流、超时与响应结构变化只返回安全错误枚举。 / Each source resolves credentials independently, caches for five minutes, and deduplicates concurrent refreshes; failures preserve the latest successful snapshot and expose bounded error enums for authorization, rate limits, timeouts, and response changes.
- 钱包设置页在账户管理之后常态显示套餐卡片，紧凑钱包与悬浮窗提供可折叠入口；新增响应式、浅深色、无嵌套交互控件和进度条可访问性样式。 / Wallet settings keeps plan cards visible after account management, while compact and floating wallet panels expose a collapsible entry with responsive, theme-native, non-nested controls and accessible progress bars.
- 钱包标签与侧边栏时钟改为跟随当前会话的实时 Provider/模型：选择 Z.ai 时隐藏 DeepSeek 余额、充值与峰谷时钟，标签切换为 5 小时 Token、月度 MCP 和本场 Token 摘要；其他第三方只显示自身会话 Token，切回 DeepSeek V4 后恢复原视图。 / Made the composer chip and sidebar clock follow the current session's live provider/model selection: Z.ai hides DeepSeek balance, recharge, and peak pricing in favor of 5-hour Token, monthly MCP, and session-token summaries; other providers show only their own session usage, and DeepSeek V4 restores the original view.
- 新增套餐响应归一化、缓存迁移、官方域名白名单、路由安全、失败保留和 UI 回归测试，并使用本机已配置的 Z.ai 中国区 Coding Plan 做了不输出敏感信息的真实接口验证。 / Added coverage for response normalization, cache migration, official-origin pinning, route safety, stale-success retention, and UI behavior, plus a redacted real-interface verification against the locally configured Z.ai China Coding Plan.

## 0.3.2 - 2026-08-23

- 新增 365 天本地 Token 用量账本与折叠式热力图：按日期、会话、模型和官方/第三方 provider 展示调用次数、Token、缓存命中率与可定价费用。 / Added a 365-day local Token ledger and collapsible heatmap grouped by date, session, model, and official/third-party provider.
- 稳定的 `(turn, step)` 或请求标识会去重，后到的最终样本替换先前样本；费用在用量发生时锁定，未知价格只保留 Token。 / Stable `(turn, step)` or request identities are deduplicated, later final samples replace earlier ones, and cost is locked at usage time while unknown prices retain tokens only.
- 历史账本与当前会话清除分开，历史数据只写入本机钱包存储，不保存提示词、工具参数或回答正文；支持独立清除全部历史账本。 / History clearing is separate from current-session clearing; the local store keeps no prompts, tool arguments, or response bodies and exposes an independent clear-history action.
- 新增 `/api/wallet/history` 与 `/api/wallet/clear-history`，并补充跨平台、价格锁定、去重和 UI 回归测试。 / Added the history endpoints and regression coverage for cross-platform persistence, price locking, deduplication, and the heatmap UI.
- 提高浅色与深色主题下辅助文字的对比度，覆盖历史说明、统计标签、星期、账户数量、密钥掩码和版本号。 / Raised auxiliary-text contrast in light and dark themes across history labels, weekday markers, account metadata, masked keys, and version text.
- 重排钱包设置页：账户管理与常态展开的 365 天热力图紧跟余额概览，健康检查和显示/提醒偏好后移；紧凑钱包面板仍可折叠历史区。 / Reordered wallet settings so account management and the always-visible 365-day heatmap follow the balance overview, while compact wallet panels keep the history section collapsible.
- 全面加固账本准确性：去重键加入 provider/模型，修复清除会话后晚到样本少算、未定价状态无法恢复，并阻止在线价格同步覆盖历史固定价策略。 / Hardened ledger accuracy by isolating dedup keys per provider/model, fixing late replacements after session clearing, recovering unpriced state, and preventing live pricing sync from mutating historical flat-rate policies.
- 为 `wallet.json` 与 `accounts.json` 补齐主备恢复和失败锁写；Windows DPAPI 与 macOS/Linux AES-GCM 均覆盖损坏密文、权限、无明文和重启读取测试。 / Added primary/backup recovery and fail-closed writes for both stores, with Windows DPAPI and macOS/Linux AES-GCM coverage for corrupt ciphertext, permissions, plaintext exclusion, and reloads.
- 修复 320–390px 设置页被宿主导航挤压、热力图 resize 后偏离最新日期、365 个空白键盘焦点、异步旧响应覆盖和浅深色强度/对比度问题。当前 110/110 测试通过。 / Fixed narrow settings layout, recent-date tracking across resize, excessive empty keyboard stops, stale async responses, and light/dark heatmap contrast. 110/110 tests pass.

## 0.3.1 - 2026-08-23

- 修复 Windows DPAPI 账户密钥在重启后无法解密的问题，并在加密文件损坏或密钥不可用时锁定写入，避免覆盖原数据。 / Fixed Windows DPAPI account keys failing to decrypt after restart and locked writes when encrypted data cannot be recovered, preventing accidental overwrite.
- 修复 Electron/Tauri 同步通知句柄的点击/关闭回调断链，并让所有充值入口统一经过桌面端外链适配与首次域名确认。 / Fixed callback wiring for synchronous Electron/Tauri notification handles and routed every recharge entry through the desktop external-link adapter and first-use domain confirmation.
- 修复官方价格页改用“周一至周五”表述后同步被误判为结构变化的问题，并把视觉模型的计费生效时间校正为 2026-08-21 上线日。 / Accepted the official pricing page's current weekday-only wording and corrected vision-model billing to its 2026-08-21 launch date.
- 将周五 18:00 至周一 09:00 作为连续低谷周期：周五提示“周末全天低谷”，周六/周日分别显示当天全天低谷，周一 09:00 前显示剩余多久进入高峰；跨午夜不重复提醒。 / Treated Friday 18:00 through Monday 09:00 as one continuous off-peak period: Friday previews the all-weekend rule, Saturday/Sunday name the current day, Monday shows time remaining to peak, and midnight boundaries do not repeat alerts.
- 旧客户端在周末收到空峰值窗口，避免未强刷的 Edge 标签页继续误报高峰；账户文件现在自动保留加密 `.bak`，主文件缺失时可自动恢复。当前 91/91 通过。 / Weekend snapshots give stale clients no peak windows so an old Edge tab cannot keep falsely reporting peak; encrypted account files now keep a `.bak` fallback that restores a missing primary file. 91/91 tests pass.

## 0.3.0 - 2026-08-23

- 新增 `deepseek-v4-flash-vision-exp` 视觉模型计费，沿用 V4 Flash 的峰谷价格；图片 token 由 Harness 上报后与文本 token 一起计入。 / Added billing for `deepseek-v4-flash-vision-exp` using V4 Flash peak/off-peak rates; image tokens reported by Harness are counted with text tokens.
- 新增官方价格页自动检查：成功解析并完整校验后才应用新规则，网络失败或页面结构变化时保留内置规则并显示状态。 / Added official pricing-page sync: new rules apply only after complete validation; network failures or schema changes keep the built-in policy and expose the status.
- 新增 Harness 健康检查：显示宿主/插件版本、兼容性、价格同步状态与无敏感信息的诊断复制。 / Added Harness health checks for host/plugin versions, compatibility, pricing-sync status, and safe diagnostic copying.
- 多账户 API Key 改为加密存储：Windows 使用当前用户 DPAPI，其他系统使用 AES-GCM 本地密钥文件；兼容旧版明文账户文件并在下次保存时迁移。 / Encrypted multi-account API keys at rest with Windows DPAPI or an AES-GCM local key file; legacy plaintext account files migrate on the next save.

## 0.2.6 - 2026-08-23

- 跟随 DeepSeek 官方规则更新峰谷计费：自 2026-08-23 北京时间 00:00 起，周六、周日全天按低谷价计费；工作日高峰仍为 09:00–12:00、14:00–18:00。 / Updated peak/off-peak billing to match DeepSeek's official rule: from 2026-08-23 00:00 Beijing, Saturday and Sunday are all-day off-peak; weekday peak windows remain 09:00–12:00 and 14:00–18:00.
- 环形卡片同步显示周末全天低谷，并将倒计时指向下一个工作日 09:00。 / Updated the ring card to show weekend all-day off-peak and count down to the next weekday 09:00.

## 0.2.5 - 2026-08-23

- 修复浮动峰谷卡片在窗口缩放、卡片放大或历史坐标过期后可能跑出视口的问题；加载、缩放、排版切换和 resize 都会重新钳制位置。 / Fixed floating peak cards escaping the viewport after resize, scale changes, or stale saved coordinates; load, scale, layout changes, and resize now re-clamp the position.
- 恢复 Portal 挂载，确保自由浮动卡片和控制面板脱离侧边栏溢出裁剪。 / Restored Portal mounting so floating cards and the control panel escape sidebar overflow clipping.
- 完成主题回退清理，移除峰谷控制面板、浮动卡片和开关中的硬编码浅色背景/文字回退。 / Completed theme fallback cleanup for the peak panel, floating card, and switches.
- 保留账户安全、存储权限、刷新异常和偏好同步加固，并避免原始凭证错误文本进入日志或浏览器。 / Kept account-safety, storage-permission, refresh-failure, and preference-sync hardening without exposing raw credential errors to logs or the browser.
- 新增浮动坐标边界、Portal 和完整主题回退回归测试；当前测试基线为 78/78。 / Added regression coverage for floating-coordinate bounds, Portal mounting, and complete theme fallbacks; the test baseline is now 78/78.

## 0.2.4 - 2026-08-22

- 彻底修复暗色模式（Dark Mode）主题适配（Issue #26）：移除所有未主题化的浅色硬编码回退（`--dsw-alias-bg-elevated,#fff`、`--dsw-alias-bg-overlay,#fff` 等），全站统一使用 DSH 原生主题变量（`--dsw-alias-bg-layer-*` 与 `--dsw-alias-label-dimmed`），在深色模式下完美融入背景。 / Fully fixed Dark Mode theme compliance (Issue #26): replaced unthemed hardcoded light fallbacks with DSH native theme variables (`--dsw-alias-bg-layer-*`), rendering dark themes seamlessly without blinding white boxes.
- 新增峰谷时钟专属控制面板（Dedicated Control Panel）：点击时钟卡片即可就地弹出专属浮动控制面板，支持实时查看峰谷优惠说明、账户余额明细与快速充值，并提供排版切换、缩放调节与归位管理。 / Added a dedicated peak clock control popover: clicking the clock card opens an interactive panel for live rate info, quick recharge, orientation toggles, and layout controls.
- 峰谷时钟支持自由拖拽与持久化记忆：卡片支持在屏幕上任意拖拽移动，脱离侧边栏限制（Portal 渲染），拖拽释放自动持久化坐标，并在浮动卡片右上角和控制面板提供一键「↩ 归位」回到侧边栏底部。 / Added free-floating drag & drop for the peak clock: smoothly movable across the viewport with boundary clamping, position persistence in localStorage, and one-click dock reset.
- 峰谷时钟横向与纵向排版自由切换：支持标准的横向卡片与 ~140px 纤细纵向胶囊卡片（侧边栏内居中、浮动时轻巧紧凑）。 / Added customizable layout: seamlessly toggle between horizontal card layout and slim ~140px vertical capsule layout.
- 充值按钮内嵌排版优化：将充值按钮移至第三行倒计时右侧，彻底消除竖排按钮对第二行金额造成的水平挤压与 `¥...` 截断问题，金额与本场消耗 100% 完整显示。 / Relocated recharge button inline next to the countdown row, completely eliminating text truncation on the balance and session cost line.
- 新增时钟缩放滑条（100% ~ 120%）与充值按钮独立开关：支持按需放大时钟或收缩整体卡片尺寸。 / Added a dedicated scale slider (100% ~ 120%) and recharge button visibility toggle in both the popup panel and settings page.

## 0.2.3 - 2026-08-21

- 修复 Provider 分桶实际未参与计费的问题；已勾选的包装路由现在真正进入官方 token/花费桶，并记录新观察到的 Provider。 / Fixed provider aliases not reaching the billing path: opted-in wrapper routes now enter the official token/cost bucket, and newly observed providers are recorded.
- 修复首次添加账户时凭证同步失败仍显示为当前账户的问题；失败会回滚激活状态。 / Rolled back first-account activation when the host refuses credential synchronization.
- 修复删除账户后账户专属阈值未写回钱包存储的问题。 / Persisted removal of account-specific thresholds when an account is deleted.
- 余额错误改为安全枚举，避免把上游错误原文暴露到浏览器；美元/多余额记录的明细选择也统一。 / Replaced raw balance errors with safe enums and aligned multi-currency balance selection.
- 统一提醒设置的本地存储格式，并兼容旧的毫秒字段；API Key 输入框默认隐藏。 / Unified reminder storage with migration from the legacy millisecond field and made API-key inputs password fields.

## 0.2.2 - 2026-08-20

- 新增 24h 峰谷计费分时时钟：在侧边栏左下角常驻展示当前时段（高峰/低谷半价）、剩余倒计时、实时余额与本场/本约花费；折叠导轨模式下自动收拢为 42px 紧凑环形钟。 / Added a 24h peak/off-peak ring clock in the sidebar footer: live pricing window (peak / 50% off-peak), switch countdown, live balance and session spend; collapses into a 42px compact circle in rail mode.
- 侧边栏时钟卡片视觉重构：三行式清爽信息流，字号与容器全面放大，右侧内置紧凑竖排「充值」按钮直达官方充值后台，消除横向挤压与文本截断。 / Restyled the sidebar footer card: three-line spacious flow, larger typography, and a compact vertical recharge button that opens official top-up without text truncation.
- 峰谷切换系统通知：跨越峰谷时段时自动推送桌面系统通知（可在设置中随心开启/关闭），不错过半价调用的省钱窗口。 / Added peak/off-peak desktop switch reminders with a dedicated toggle in settings.
- 跨组件毫秒级实时同步：输入框钱包芯片与侧边栏时钟卡片通过全局事件总线（`dshw-snapshot-update` / `dshw-refresh`）毫秒级联动，账户切换与会话消耗实时双向一致。 / Cross-component event sync: wallet composer chip and sidebar clock card stay 100% in sync across account switches and live session token usage.
- 会话花费彻底杜绝 `--` 占位：始终常驻真实货币金额（无消耗显示 $0.00 / ¥0.00），随多币种账户（USD/CNY）实时切换对应格式与估算/精确标签。 / Always-visible numeric session cost: never drops to `--`, defaults to $0.00/¥0.00, and hot-adapts to active account currency (USD/CNY).

## 0.2.1 - 2026-08-20

- 标签上「本场」恢复常显（¥0.00 也显示，新会话不再缺席）；仅未定价模型仍隐藏。/ The chip shows the session cost again even at ¥0.00; only unpriced models stay hidden.
- 面板/浮动窗版本号移至底部右下角，不再与顶栏按钮挤压。 / Panel version tags moved to the footer, clear of the header buttons.

## 0.2.0 - 2026-08-19

- 新增多账户管理与热切换：面板内“账户管理”可添加多个账户（名称 + API Key），切换后无需重启，下一次 LLM 调用即按新账户计费；key 界面掩码显示，余额查询跟随当前账户（contributed in PR #4 by mxchen-xyz）。 / Added multi-account management with hot switching: manage accounts in the panel, and the very next LLM call is billed with the newly activated key — no restart needed; keys stay masked in the UI and balance follows the active account.
- 面板视觉重做：余额横排摘要卡、设置合并为分组卡片（胶囊开关、行内滑块、阈值保存贴边）、账户列表限高两行滚动、主操作并列与安静的清除入口。 / Restyled the panel: horizontal balance summary card, grouped settings card (chip toggles, inline slider, threshold save inline), two-row scrollable account list, and paired primary actions with a quiet destructive entry.
- 宿主设置面板（视觉工具下方）新增「钱包」设置页：余额、阈值、显示内容、芯片比例、完成提醒与账户管理，与标签面板实时同步。 / Added a 钱包 (Wallet) page to the host settings panel below Visual tools: balance, threshold, visibility, chip scale, completion reminders, and account management, kept in sync with the chip panel.
- 设置页钱包页两列网格布局铺满宿主内容列，余额行横排。 / The settings wallet page lays controls out in a two-column grid that fills the host settings column.
- 会话花费跟随当前账户货币：美元账户显示「本约 $x」（按 CNY 价折算的估算值，标签承担约算含义），人民币账户显示精确的「本场 ¥x」。 / Session cost follows the active account currency: USD accounts show 本约 $x (a labeled estimate converted from the CNY table), CNY accounts show the exact 本场 figure.
- 芯片上低于显示精度的会话花费（如 $0.00）直接隐藏，面板照常显示，高缩放下更容易保持完整布局。 / Sub-cent session spend is hidden on the chip (kept in panels) so the full layout survives high scale factors.
- 输入框位置缩放上限进一步收紧为 105%（悬浮/侧边仍 125%）。 / Tightened the composer-docked scale cap to 105%, while floating and side docks retain 125%.
- 包装官方的路由（如 dsh-vision-proxy 的 deepseek-vision）可勾选计入官方计费桶：设置页新增「Provider 分桶」，自动列出出现过的 provider，勾选即按官方价格计入本场花费（Fixes #21, reported by @wenjie0112）。 / Wrapper provider routes (e.g. deepseek-vision from dsh-vision-proxy) can be checked into the official billing bucket: the settings page gains a Provider section listing observed providers; checked ones bill officially.
- 账户激活通过宿主凭据接口写入 `DEEPSEEK_API_KEY`；若启动环境变量覆盖该值，则安全拒绝切换，避免显示虚假的激活状态。 / Account activation writes through the host credentials seam and safely refuses switching when a launch-time environment variable shadows `DEEPSEEK_API_KEY`.
- 新增账户列表、激活和移除 API，并补充账户存储辅助函数测试。 / Added account list, activation, and removal APIs with account-store helper coverage.

## 0.1.5 - 2026-08-18

- 修复输入框内的余额标签被固定压缩成 44px 极简显示的问题，现在按实际可用空间在完整 / 紧凑 / 极简三档间自动切换。 / Fixed the composer chip always collapsing to its 44px compact value; it now switches between full, fit, and compact layouts by measured space.
- 修复缩放比例不等于 100% 时被误判为空间不足的问题。 / Fixed compact mode being mis-triggered whenever the scale was not 100%.
- 修复芯片拖到输入框旁悬浮时被其他面板遮挡的问题。 / Fixed docked chips being covered by neighbouring host panels.
- 输入框内缩放上限调整为 120%，悬浮 / 侧边停靠时仍可到 125%。 / The scale slider is capped at 120% in the composer row; floating and side docks keep the full 75–125% range.

## 0.1.4 - 2026-08-17

- Reworked wallet placement around direct manipulation: the chip can stay in the composer, move freely, or snap to the composer bottom, viewport sides, and the main-content divider. Dragging now previews the destination and can cross from one region to another in a single gesture instead of being trapped by an intermediate snap.
- Added compact horizontal and vertical dock layouts, narrowed the side-dock frame without shrinking its text, and kept every vertical value directly below its label. When a narrow composer cannot fit the full home chip, it now preserves a clickable 44px balance/token value instead of overflowing under the model selector.
- Added a 75–125% live scale slider and independent official/third-party visibility controls, while preventing both data sources from being hidden at once.
- Made the details panel draggable with a remembered, viewport-clamped position. “Minimize” now goes directly to a freely movable circular wallet instead of creating a second floating state.
- Expanded conversation-completion reminders with persistent or timed dismissal, simultaneous-completion queueing, deduplication, cross-tab ownership, click-to-open behavior, and an in-page fallback when system notifications cannot be delivered.
- Added a single desktop-wrapper compatibility adapter for notifications, notification permission, local storage, external links, and optional host capabilities. Synchronous, fire-and-forget, Promise-based, and failure-fallback notification bridges are covered by regression tests.
- Added a host-gated permanent-deletion preference. The npm plugin exposes the preference only when the surrounding DSH host advertises a real deletion implementation; unsupported hosts show a disabled control. The separate “clear wallet data” action was renamed and documented to make clear that it removes only this conversation's wallet counters, not the conversation.
- Added a versioned Agent host-integration kit for permanent deletion: bilingual guides, a complete adaptation prompt, compatibility manifest, read-only preflight, upstream/license notice, and a reference patch pinned to DSH commit `47f943859bef60e4160492346772ded9b24f765a` (`0.1.0-rc.5`). The npm plugin still does not claim to be the deletion engine.
- Tightened the control-panel layout and labels without reducing the base font size, including clearer completion-reminder and permanent-deletion controls.
- Replaced screenshot-dependent README sections with detailed English and Chinese product introductions, package-safe language navigation, explicit compatibility evidence levels, and clearer trust and host-capability boundaries.
- Expanded the zero-dependency test suite with release metadata, documentation-resource, HTTP route-boundary, layout, reminder, desktop fallback, and capability-gating checks; added exact npm archive verification for the 0.1.4 release candidate.
- Expanded validation to Windows, Ubuntu, and macOS on Node 22.19 and 24, added cross-platform reference-patch checks and focused DSH deletion-chain tests, and added npm OIDC trusted publishing for formal GitHub Releases.

## 0.1.3 - 2026-08-16

- Fixed the recharge shortcut so its first click reliably opens the anti-phishing confirmation, including when the detail panel is closed (contributed in PR #2 by QZYWQ).
- Fixed the detail panel opening below the viewport; it now uses viewport-aware fixed positioning and flips above the chip when needed.
- Session cost is now accumulated at the price active when each usage event arrives, so historical spend no longer changes at peak/off-peak or policy boundaries. Existing stores migrate once to schema v2 and keep the migrated estimate.
- Added currency-aware balance formatting and stopped applying the CNY low-balance threshold to non-CNY accounts.
- Reworked floating drag with pointer events for mouse and touch, fixed click-without-drag crashes, and clamp positions using the actual dot/window dimensions.
- Replaced nested clickable markup with native buttons, added dialog semantics, focus handling, Escape support, and keyboard focus styles.
- Moved the interactive chip to the Harness `conversation.input.left` slot, deduplicated concurrent balance refreshes, and flush pending persisted changes during plugin shutdown.
- Expanded regression coverage and CI to run tests and package verification on Linux and Windows with Node 22 and 24.
- Added capability-based browser/desktop adaptation: optional wrapper bridges for notifications, storage, and external links; in-page notification, cross-tab lease, and CSS-scale fallbacks; and host capability discovery that disables unsupported permanent-delete controls instead of exposing a dead switch.
- Fixed completion reminders for the currently selected conversation by detecting its running-to-idle transition; desktop notification bridges now also support fire-and-forget, Promise-based, and native callback APIs.

## 0.1.2 - 2026-08-15

- Fixed the client bundle loader id to match the package name (`deepseek-harness-wallet`); 0.1.1 still registered the old `dsh-wallet` id, which aborted the whole plugin boot ("loaded without registering") after the rename. Regression test added.
- Implemented the 2026-08-17 peak/off-peak pricing for the v4 models (Beijing 09:00–12:00 / 14:00–18:00 peak; off-peak is half the peak rate).
- Fixed the v4 pricing effective date in the READMEs (2026-04-24, matching the V4 preview launch).
- Balance total now prefers the CNY record and never sums mixed currencies (fixes wrong totals and false low-balance alerts on international accounts).
- Hardened the persisted store: threshold values are coerced on load, saves are atomic (temp file + rename), and boot-retry timers are cleaned up on plugin stop.
- Floating window drag now clamps by the dragged element's real size, so the panel can no longer be pushed mostly off-screen.

## 0.1.1 - 2026-08-14

- Added floating window mode: detach the wallet panel into a draggable floating window with a persistent position, or minimize it to a dot that turns red when the balance is below the threshold.
- Replaced the control-panel screenshot with floating-window screenshots in the READMEs.

## 0.1.0 - 2026-08-14

- Initial public release.
- Added official DeepSeek balance monitoring and manual refresh.
- Added per-session DeepSeek cost estimation and provider-aware token counters.
- Added configurable low-balance alerts and desktop notifications.
- Added a guarded shortcut to the official DeepSeek recharge page.
- Added English and Simplified Chinese documentation.
