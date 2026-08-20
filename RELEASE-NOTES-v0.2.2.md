## 中文

**本版本主打：24h 峰谷计费分时时钟 + 侧边栏常驻控制中心 + 跨组件毫秒级实时同步**

- **24h 峰谷分时时钟**：侧边栏左下角常驻展示高峰/低谷半价时段表盘，实时显示当前计费状态、剩余切换倒计时与系统级桌面切换提醒
- **侧边栏时钟控制卡片**：三行式清爽信息流，字号与容器等比放大，右侧内置紧凑竖排「充值」按钮直达官方充值后台，兼顾自适应折叠导轨模式
- **跨组件毫秒级实时联动**：输入框钱包芯片与侧边栏时钟卡片全局事件广播打通，余额变动、多账号切换与会话 Token 消耗实时毫秒级同步
- **会话花费常显不缺席**：彻底消除 -- 占位符，始终常驻标准货币金额（初始 .00 / ¥0.00），随人民币/美元多币种账户自动切换

**升级**：dsh plugin --profile web update deepseek-harness-wallet（若 profile 钉版需同步改版本号），重启 dsh web 后强刷页面。

**兼容**：dsh 0.1.0-rc.7 实测（Windows + Edge）；CI 三平台（Ubuntu/macOS/Windows）× Node 22/24 全绿，零原生依赖、零 OS 特定代码。

---

## English

**Highlights: 24h peak/off-peak ring clock, sidebar footer control card, and cross-component live sync.**

- **24h Peak/Off-Peak Ring Clock** — sidebar footer widget visualizing peak and 50% discount off-peak pricing windows with live pointer, countdown, and desktop switch reminders
- **Restyled Sidebar Footer Card** — spacious 3-line layout, enlarged typography, and a compact vertical recharge button opening official top-up without text truncation
- **Cross-Component Millisecond Sync** — global event bus keeps composer chip and sidebar footer card 100% in sync during account switches and active session spend
- **Always-Visible Numeric Session Cost** — replaces -- with standard formatted figures (.00 / ¥0.00), auto-adapting to USD/CNY accounts

**Upgrade**: dsh plugin --profile web update deepseek-harness-wallet, restart dsh web, hard-refresh.

**Compatibility**: verified on dsh 0.1.0-rc.7 (Windows + Edge); CI green on Ubuntu/macOS/Windows × Node 22/24; zero native dependencies and zero OS-specific code.
