## 中文

**本版本主打：每账号独立阈值 + 界面全面打磨**

- **阈值按账号独立**：每个账号各设各的低余额提醒线（A 账号 1、B 账号 2 互不影响）；切换账号输入框零等待跳转，删除账号自动清理
- **多币种提醒**：人民币/美元各自口径，美元账户正常参与低额提醒，不再跨币种比较
- **低额红色精确化**：只有余额数字变红（标签/本场/官/三方 token 保持正常色），红框 + 可关闭的闪烁
- **新会话常显本场**：`本场 ¥0.00` 不再缺席，花钱即涨
- **设置页重设计**：账户中心概览卡、提醒与会话 2×2 分组、紧凑单行账户列表、充值/刷新/清除等宽三按钮、760px 窄窗口自动单列
- 面板标题携带当前账号名；版本号统一移至各面板底部

**升级**：`dsh plugin --profile web update deepseek-harness-wallet`（若 profile 钉版需同步改版本号），重启 `dsh web` 后强刷页面。

**兼容**：dsh 0.1.0-rc.7 实测（Windows + Edge）；CI 三平台（Ubuntu/macOS/Windows）× Node 22/24 全绿，零原生依赖、零 OS 特定代码。

---

## English

**Highlights: per-account thresholds and a full UI polish pass.**

- **Per-account low-balance thresholds** — each account keeps its own warning line (account A at 1, account B at 2); switching accounts jumps the input instantly, removing an account cleans its line
- **Multi-currency aware** — CNY and USD lines are stored separately; USD accounts now participate in low-balance alerts without cross-currency comparison
- **Precise low-balance styling** — only the balance figure turns red (labels, session cost, and token counts stay normal), with a red frame and a toggleable blink
- **Session cost always visible** — fresh chats show `本场 ¥0.00` instead of dropping the segment
- **Settings page redesign** — account-center hero card, 2×2 reminder group, compact single-row account list, equal-width recharge/refresh/clear trio, single-column under 760px
- Panel titles carry the active account name; version tags moved to panel footers

**Upgrade**: `dsh plugin --profile web update deepseek-harness-wallet`, restart `dsh web`, hard-refresh.

**Compatibility**: verified on dsh 0.1.0-rc.7 (Windows + Edge); CI green on Ubuntu/macOS/Windows × Node 22/24; zero native dependencies and zero OS-specific code.
