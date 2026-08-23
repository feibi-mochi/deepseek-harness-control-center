## v0.2.5 · 卡片不出屏、拖动与暗色模式修复

### 中文

这次更新主要解决峰谷卡片在不同窗口、布局和主题下“不好找、拖不动、显示发白”的问题。

- **卡片不会轻易跑出屏幕**：窗口缩放、卡片放大、横竖排切换或读取旧位置后，会自动把卡片拉回可见区域。
- **自由拖动恢复正常**：卡片和控制面板不再被侧边栏裁剪，可以拖到合适的位置；面板内也可以一键归位/停靠。
- **暗色模式更自然**：峰谷面板、卡片、开关和按钮不再出现刺眼的白色背景或文字。
- **原有设置继续保留**：横排/竖排、100%–120% 缩放、充值按钮开关和卡片位置都会记住。

**升级**：`dsh plugin --profile web update deepseek-harness-wallet`，重启 `dsh web` 后强制刷新页面。

**验证**：已在 DeepSeek Harness `0.1.0-rc.8`、Windows + Edge 实测；CI 覆盖 Ubuntu/macOS/Windows × Node 22.19/24，测试 78/78 通过。

---

### English

This update fixes the peak/off-peak card when different window sizes, layouts, or themes make it hard to find, drag, or read.

- **The card stays on screen** — saved coordinates are re-clamped after viewport resize, scale changes, orientation changes, or stale positions.
- **Free dragging works reliably** — the card and control panel escape sidebar clipping, and the panel includes a one-click reset/dock action.
- **Dark mode looks native** — the peak panel, card, switches, and buttons no longer fall back to glaring white backgrounds or text.
- **Existing preferences remain** — horizontal/vertical layout, 100%–120% scale, recharge-button visibility, and card position are remembered.

**Upgrade**: `dsh plugin --profile web update deepseek-harness-wallet`, restart `dsh web`, then hard-refresh the page.

**Verification**: tested with DeepSeek Harness `0.1.0-rc.8` on Windows + Edge; CI covers Ubuntu/macOS/Windows × Node 22.19/24, with 78/78 tests passing.
