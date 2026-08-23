## 中文

**v0.2.5 是一次峰谷浮动卡片边界与主题兼容性修复。**

- **浮动位置更可靠**：历史坐标、窗口缩放、卡片放大、横纵排版切换后都会重新限制在视口内，避免卡片跑出屏幕。
- **恢复 Portal 挂载**：浮动卡片和专属控制面板继续脱离侧边栏溢出裁剪，保证自由拖动真正可用。
- **暗色主题回退清理**：移除峰谷面板、浮动卡片、开关和按钮中的硬编码浅色背景/文字回退。
- **保留安全加固**：账户错误枚举、存储权限、余额刷新异常处理、偏好同步防回声和拖拽点击隔离均保留。
- **测试增强**：新增浮动坐标边界、Portal 和完整主题回退测试，当前 78/78 通过。

**升级**：`dsh plugin --profile web update deepseek-harness-wallet`，重启 `dsh web` 后强制刷新页面。

**兼容**：已在 DeepSeek Harness `0.1.0-rc.8`、Windows + Edge 实测；CI 覆盖 Ubuntu/macOS/Windows × Node 22.19/24。

---

## English

**v0.2.5 is a reliability release for floating peak-clock bounds and theme compatibility.**

- **Reliable floating bounds** — saved coordinates are re-clamped after load, viewport resize, scale changes, and orientation changes so the card stays reachable.
- **Portal mounting restored** — floating cards and the dedicated control panel escape sidebar overflow clipping, keeping free dragging reliable.
- **Dark-theme fallback cleanup** — removed hardcoded light background/text fallbacks from the peak panel, floating card, switches, and buttons.
- **Security hardening retained** — bounded account errors, storage permissions, balance-refresh failure handling, preference self-echo protection, and drag/click isolation remain covered.
- **Stronger tests** — added floating-coordinate, Portal, and complete theme-fallback regression coverage; 78/78 tests pass.

**Upgrade**: `dsh plugin --profile web update deepseek-harness-wallet`, restart `dsh web`, then hard-refresh the page.

**Compatibility**: verified with DeepSeek Harness `0.1.0-rc.8` on Windows + Edge; CI covers Ubuntu/macOS/Windows × Node 22.19/24.
