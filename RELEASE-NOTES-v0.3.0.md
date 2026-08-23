## v0.3.0 · 视觉模型、官方价格同步与安全检查

### 中文

- **支持视觉模型**：新增 `deepseek-v4-flash-vision-exp` 计费，图片 token 会与文本 token 一起统计。
- **官方价格自动检查**：定期读取 DeepSeek 官方价格页，完整校验后才应用；页面不可用或格式变化时不会盲目修改计费规则。
- **Harness 健康检查**：显示 Harness 版本、插件版本、兼容性、价格同步状态和账户存储状态，并支持复制不含 Key/路径的诊断信息。
- **账户 Key 加密**：Windows 使用当前用户 DPAPI；其他系统使用 AES-GCM 本地密钥文件。旧版明文账户文件会在下次保存时自动迁移。

升级：`dsh plugin --profile web update deepseek-harness-wallet`，重启 `dsh web` 后强制刷新页面。

验证：82/82 测试通过，覆盖视觉模型价格、官方页面解析、健康检查和账户加密迁移路径。

---

### English

- **Vision model support**: added billing for `deepseek-v4-flash-vision-exp`; image tokens are counted with text tokens.
- **Official pricing checks**: periodically reads the official DeepSeek pricing page and applies only fully validated rules; unavailable or changed pages never silently alter billing.
- **Harness health checks**: shows Harness/plugin versions, compatibility, pricing-sync status, and account-storage status, with safe diagnostics that contain no keys or local paths.
- **Encrypted account keys**: Windows uses current-user DPAPI; other platforms use an AES-GCM local key file. Legacy plaintext account files migrate on the next save.

Upgrade: `dsh plugin --profile web update deepseek-harness-wallet`, restart `dsh web`, then hard-refresh the page.

Verification: 82/82 tests pass, covering vision-model pricing, official-page parsing, health checks, and encrypted account migration.
