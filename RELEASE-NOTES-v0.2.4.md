## 中文

**v0.2.4 是一次暗色主题深度适配、峰谷时钟专属控制面板与自由拖拽排版定制的重要体验升级。**

- **暗色模式（Dark Mode）深度适配 (Fixes #26)**：彻底清除所有硬编码浅色回退（`#fff`），全站统一使用 DSH 原生主题变量（`--dsw-alias-bg-layer-*`），在暗黑模式下无缝融入，彻底告别刺眼白底。
- **峰谷时钟专属控制面板（Dedicated Control Panel）**：点击时钟卡片即可就地唤起精致的「⚡ 峰谷时钟控制面板」悬浮窗，支持实时查看峰谷优惠费率说明、账户可用余额明细与快速充值，并提供一站式排版、缩放与提醒定制。
- **自由拖拽移动与位置记忆**：支持按住时钟卡片自由拖拽至屏幕任意位置（Portal 挂载与视口防溢出吸附），拖拽释放自动持久化坐标，并在浮动卡片右上角和控制面板提供一键「↩ 归位至侧边栏底部」。
- **横向 / 纵向（Slim Capsule）排版自由切换**：支持标准横向卡片与 ~140px 纤细纵向胶囊卡片（侧边栏内居中、浮动时轻巧紧凑）。
- **充值按钮内嵌排版重构**：将充值按钮移至第三行倒计时右侧，彻底消除竖排按钮对第二行金额造成的横向挤压，金额与本场消耗 100% 完整显示，绝不出现 `¥...` 截断。
- **时钟卡片大小缩放与充值按钮独立开关**：支持 100% ~ 120% 比例自由缩放，可独立开启或关闭充值按钮以进一步收缩卡片体积。
- **全套测试回归**：新增专属控制面板交互、横竖排版、滑条缩放、充值开关、浮动归位与暗色主题变量断言，当前 74/74 项测试全部通过。

**升级**：`dsh plugin --profile web update deepseek-harness-wallet`，重启 `dsh web` 后强制刷新页面。

**兼容**：已在 DeepSeek Harness `0.1.0-rc.8`、Windows + Edge 实测；CI 覆盖 Ubuntu/macOS/Windows × Node 22.19/24。

---

## English

**v0.2.4 is a major UX update featuring full Dark Mode theme compliance, a dedicated peak clock control panel, free-floating drag & drop, and flexible layout customization.**

- **Full Dark Mode theme compliance (Fixes #26)** — removed all un-themed hardcoded white fallbacks (`#fff`), unifying with native DSH theme variables (`--dsw-alias-bg-layer-*`) for seamless, glare-free dark theme rendering.
- **Dedicated Peak Clock Control Panel** — clicking the peak clock card opens an interactive popover with live rate info, detailed account balance, quick recharge, and real-time layout & notification toggles.
- **Free-floating drag & drop with persistence** — smoothly drag the clock card anywhere on screen with automatic viewport clamping, persistent position memory in localStorage, and one-click dock reset in both the card header and control panel.
- **Flexible layout customization (Horizontal & Slim Vertical)** — seamlessly switch between the full horizontal layout and a slim ~140px vertical capsule layout (centered in the sidebar, compact when floating).
- **Inline recharge button layout** — relocated the recharge button next to the countdown row, completely resolving horizontal text truncation on the balance and session cost line.
- **Dedicated scale slider & recharge toggle** — scale the clock from 100% to 120% with live slider feedback, or toggle off the recharge button for a super-compact card footprint.
- **Stronger test coverage** — added assertions for dedicated popover interaction, orientation switching, scale bounds, recharge toggling, floating dock reset, and dark mode compliance; 74/74 tests pass.

**Upgrade**: `dsh plugin --profile web update deepseek-harness-wallet`, restart `dsh web`, then hard-refresh the page.

**Compatibility**: verified with DeepSeek Harness `0.1.0-rc.8` on Windows + Edge; CI covers Ubuntu/macOS/Windows × Node 22.19/24.
