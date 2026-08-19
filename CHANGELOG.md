# Changelog

All notable changes to this project are documented in this file.

## 0.2.1 - 2026-08-20

- 标签上「本场」恢复常显（¥0.00 也显示，新会话不再缺席）；仅未定价模型仍隐藏。/ The chip shows the session cost again even at ¥0.00; only unpriced models stay hidden.
- 面板/浮动窗版本号移至底部右下角，不再与顶栏按钮挤压。 / Panel version tags moved to the footer, clear of the header buttons.

## 0.2.0 - 2026-08-18

- 新增多账户管理与热切换：面板内“账户管理”可添加多个账户（名称 + API Key），切换后无需重启，下一次 LLM 调用即按新账户计费；key 界面掩码显示，余额查询跟随当前账户（contributed in PR #4 by mxchen-xyz）。 / Added multi-account management with hot switching: manage accounts in the panel, and the very next LLM call is billed with the newly activated key — no restart needed; keys stay masked in the UI and balance follows the active account.
- 面板视觉重做：余额横排摘要卡、设置合并为分组卡片（胶囊开关、行内滑块、阈值保存贴边）、账户列表限高两行滚动、主操作并列与安静的清除入口。 / Restyled the panel: horizontal balance summary card, grouped settings card (chip toggles, inline slider, threshold save inline), two-row scrollable account list, and paired primary actions with a quiet destructive entry.
- 宿主设置面板（视觉工具下方）新增「钱包」设置页：余额、阈值、显示内容、芯片比例、完成提醒与账户管理，与标签面板实时同步。 / Added a 钱包 (Wallet) page to the host settings panel below Visual tools: balance, threshold, visibility, chip scale, completion reminders, and account management, kept in sync with the chip panel.
- 设置页钱包页两列网格布局铺满宿主内容列，余额行横排。 / The settings wallet page lays controls out in a two-column grid that fills the host settings column.
- 会话花费跟随当前账户货币：美元账户显示「本约 $x」（按 CNY 价折算的估算值，标签承担约算含义），人民币账户显示精确的「本场 ¥x」。 / Session cost follows the active account currency: USD accounts show 本约 $x (a labeled estimate converted from the CNY table), CNY accounts show the exact 本场 figure.
- 芯片上低于显示精度的会话花费（如 $0.00）直接隐藏，面板照常显示，高缩放下更容易保持完整布局。 / Sub-cent session spend is hidden on the chip (kept in panels) so the full layout survives high scale factors.
- 输入框位置缩放上限进一步收紧为 105%（悬浮/侧边仍 125%）。
- 包装官方的路由（如 dsh-vision-proxy 的 deepseek-vision）可勾选计入官方计费桶：设置页新增「Provider 分桶」，自动列出出现过的 provider，勾选即按官方价格计入本场花费（Fixes #21, reported by @wenjie0112）。 / Wrapper provider routes (e.g. deepseek-vision from dsh-vision-proxy) can be checked into the official billing bucket: the settings page gains a Provider section listing observed providers; checked ones bill officially. / The composer-docked scale cap tightens to 105% (floating and side docks keep 125%).

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

## 0.2.0 - 2026-08-16

- Added multi-account management: add / list / remove multiple DeepSeek accounts from the wallet panel's 账户管理 section; keys are stored in `$DSH_HOME/storages/accounts.json` and the UI only shows masked keys.
- Added hot account switching: activating an account writes its key into the credentials seam (`credentials.set('DEEPSEEK_API_KEY', ...)`), so the next LLM request is billed with the new account without a restart. Balance lookups prefer the active account's key and fall back to the credentials seam when no account is active.
- The first account added becomes the active account automatically; switching is refused with a clear error when `DEEPSEEK_API_KEY` is supplied by the launching environment (shadowed writes are rejected by the credentials provider).
- Added `GET/POST /api/wallet/accounts`, `POST /api/wallet/accounts/activate`, and `POST /api/wallet/accounts/remove` routes, plus unit tests for the account store helpers.

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
