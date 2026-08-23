## v0.2.6 · 同步官方周末低谷规则

### 中文

DeepSeek 官方已调整峰谷计费规则：从北京时间 **2026-08-23 00:00** 起，周六、周日全天按低谷价计费；工作日高峰仍为 **09:00–12:00、14:00–18:00**。

- 计费计算已同步官方规则，周末不会再误算为高峰价。
- 环形卡片在周末显示“周末低谷”，整圈按低谷状态显示，并倒计时到下一个工作日 09:00。
- 工作日原有高峰/低谷切换保持不变。

**升级**：`dsh plugin --profile web update deepseek-harness-wallet`，重启 `dsh web` 后强制刷新页面。

**验证**：已补充周末、跨周末和环形卡片状态测试；当前测试基线为 79/79。

---

### English

DeepSeek has updated its peak/off-peak billing rule: from **2026-08-23 00:00 Beijing time**, Saturday and Sunday are off-peak all day. Weekday peak windows remain **09:00–12:00 and 14:00–18:00**.

- Billing calculations now follow the official weekend rule, so weekend usage is not charged at peak rates.
- The ring card shows “weekend off-peak”, renders the full ring as off-peak, and counts down to the next weekday 09:00 switch.
- The existing weekday peak/off-peak transitions remain unchanged.

**Upgrade**: `dsh plugin --profile web update deepseek-harness-wallet`, restart `dsh web`, then hard-refresh the page.

**Verification**: added weekend, cross-weekend, and ring-state coverage; the test baseline is now 79/79.
