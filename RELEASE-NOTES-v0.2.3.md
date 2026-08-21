## 中文

**v0.2.3 是一次计费归属、账户状态与多币种显示的可靠性修复。**

- **Provider 分桶真正生效**：在设置页勾选的包装 Provider 现在会进入官方 token/花费桶，并按官方价格表计费；新观察到的 Provider 会自动出现在设置中。
- **账户状态不再错报**：首次添加账户时若宿主拒绝写入凭证，插件会回滚激活状态，不再显示与实际 LLM 计费账户不一致的“当前账户”。
- **账户阈值正确清理**：删除账户时，其独立低余额阈值会同步从钱包存储中持久化删除。
- **多币种余额一致**：充值、赠送和余额摘要统一使用服务端选中的币种记录，避免接口记录顺序造成 USD/CNY 明细错配。
- **错误信息更安全**：浏览器只接收安全错误枚举，不再显示上游原始错误；低余额提醒也会按当前币种格式化。
- **设置同步与隐私**：完成提醒统一使用同一存储结构并自动迁移旧数据；API Key 输入框默认隐藏。
- **测试增强**：新增 Provider 实际计费、账户激活回滚、阈值持久化、安全错误、多币种选择和输入框隐私回归测试，当前 70/70 全绿。

**升级**：`dsh plugin --profile web update deepseek-harness-wallet`，重启 `dsh web` 后强制刷新页面。

**兼容**：已在 DeepSeek Harness `0.1.0-rc.8`、Windows + Edge 实测；CI 覆盖 Ubuntu/macOS/Windows × Node 22.19/24。

---

## English

**v0.2.3 is a reliability release for billing attribution, account state, and multi-currency display.**

- **Provider classification now reaches billing** — opted-in wrapper providers enter the official token/cost bucket and use the official price table; newly observed providers appear automatically in settings.
- **Account state no longer overclaims activation** — if the host refuses the first credential write, the plugin rolls back the active account instead of displaying a billing account the LLM route is not using.
- **Account thresholds are cleaned up durably** — deleting an account now persists removal of its account-specific low-balance threshold.
- **Consistent multi-currency balances** — balance, topped-up, and granted figures use the server-selected currency record rather than depending on response order.
- **Safer browser errors** — the client receives bounded error enums instead of raw upstream error text, and low-balance notifications use the active currency.
- **Settings sync and privacy** — completion reminders share one canonical storage shape with legacy migration, and API-key inputs are password fields by default.
- **Stronger regression coverage** — added end-to-end provider billing, activation rollback, threshold persistence, safe error, currency-selection, and input-privacy tests; 70/70 tests pass.

**Upgrade**: `dsh plugin --profile web update deepseek-harness-wallet`, restart `dsh web`, then hard-refresh the page.

**Compatibility**: verified with DeepSeek Harness `0.1.0-rc.8` on Windows + Edge; CI covers Ubuntu/macOS/Windows × Node 22.19/24.
