# v0.2.0 Release Notes（草稿 · 待发版时使用）

## 中文

**本版本主打：多账户管理 + 全面视觉重做 + 计费准确性**

- **多账户与热切换**：面板内“账户管理”添加多个账户，切换后无需重启，下一次调用即按新账户计费（contributed in PR #4 by mxchen-xyz）
- **面板全面重做**：余额横排摘要卡、分组设置卡（胶囊开关 / 行内滑块 / 阈值保存贴边）、账户列表彩色头像 + 限高滚动
- **宿主设置页**：设置面板新增「钱包」页（视觉工具下方），与标签面板实时同步，两列网格布局
- **会话花费跟随账户货币**：美元账户显示「本约 $x」（标注估算），人民币显示精确「本场 ¥x」
- **Provider 分桶**（Fixes #21）：dsh-vision-proxy 等包装官方的路由可勾选计入官方计费桶，自动发现、勾选即生效
- **布局稳定性**：修复 44px 坍缩 / 缩放误判 / 悬浮被遮挡 / 美元金额溢出；输入框内缩放上限 105%

**升级**：`dsh plugin --profile web update deepseek-harness-wallet`，重启 `dsh web` 后强刷页面。

**兼容**：dsh 0.1.0-rc.7 实测通过（Windows + Edge）；rc.6 及相近版本兼容。

---

## English

**Highlights: multi-account management, full visual restyle, billing accuracy.**

- **Multi-account with hot switching** — add accounts in the panel; the next LLM call is billed with the newly activated key, no restart (contributed in PR #4 by mxchen-xyz)
- **Panel restyle** — horizontal balance summary card, grouped settings card (pill toggles, inline slider, inline threshold save), avatar account list with capped scrolling
- **Host settings page** — a new 钱包 page below Visual tools, two-column grid, live-synced with the chip panel
- **Session cost follows the account currency** — USD accounts show a labeled 本约 $x estimate; CNY accounts show the exact 本场 figure
- **Provider bucketing** (Fixes #21) — wrapper routes like deepseek-vision can be checked into the official billing bucket; auto-discovered, toggle in settings
- **Layout stability** — fixes for the 44px collapse, scale misjudgement, occluded floats, USD overflow; composer scale capped at 105%

**Upgrade**: `dsh plugin --profile web update deepseek-harness-wallet`, restart `dsh web`, hard-refresh.

**Compatibility**: verified on dsh 0.1.0-rc.7 (Windows + Edge); compatible with rc.6 and adjacent builds.

---

## 发版执行清单（等确认后执行，约 3 分钟）

1. `git add README.md docs/i18n/README.zh-CN.md && git commit && git push`（补提交 README 货币说明）
2. `gh release create v0.2.0 --target main --title "v0.2.0" --notes-file RELEASE-NOTES-v0.2.0.md`（用上面草稿）
3. publish.yml 自动触发 → npm 上线 `deepseek-harness-wallet@0.2.0`
4. 验证：`npm view deepseek-harness-wallet version` 显示 0.2.0

## 发版前快照（2026-08-18 23:40）

- 版本号 0.2.0 ✓ / 测试 57/57 ✓ / CI 14/14 ✓（PR #25）
- npm 当前 latest：0.1.5（累计下载 1107+，8/16 单日 774）
- GitHub：34 stars，贡献者 3 人，DSH Directory 已收录
- 本地未提交：README 两份（货币说明），已列入清单第 1 步
