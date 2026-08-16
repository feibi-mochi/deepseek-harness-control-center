# Agent 辅助适配 DSH 永久删除会话

DeepSeek Harness Control Center 可以提供“永久删除会话”开关，但 npm 插件本身不拥有 DSH 的会话存储和工作区侧边栏。真正的删除动作必须由可重新构建的 DSH 宿主实现。本目录提供一套版本化、可审查、可交给 Agent 迁移的参考资料；它不是一键安装器，也不是 DeepSeek 官方功能。

## 兼容边界

参考补丁只对应以下精确基线：

- 上游：`https://github.com/deepseek-ai/DeepSeek-Harness`
- 提交：`47f943859bef60e4160492346772ded9b24f765a`
- 当时的根包版本：`0.1.0-rc.5`
- 补丁 SHA-256：`b43b806c0856cf07889d5659f0d5ff3fd3b460696fb3a1a12a29e3b3c7b411a6`

全局发行的 `dsh 0.1.0-rc.6` 不是这个补丁的基线。只要提交或版本不同，Agent 就必须阅读当前源码，按语义迁移各项约束，禁止用三方合并或生成 reject 文件的参数强套补丁。

封闭源码、无法取得匹配源码或无法重新构建的桌面端不能适配这一宿主功能。浏览器、Electron、Tauri 类界面只有在保留 DSH Web 插件加载器、客户端 runtime、会话持久化、API proxy 与工作区 UI 接缝时，才具备适配条件。

## 参考实现覆盖范围

- 经过请求与响应校验的 `session.delete` 公共契约和客户端 runtime 调用；
- JSONL 与 SQLite 两种持久化后端删除；
- 会话所有权、运行状态、子会话、排队写入和待恢复预留检查；
- 安全释放由当前 Web runtime 持有、但已经空闲的会话；
- 删除日志前清理 Workspace 与归档引用；
- 保留可能被其他会话共用的内容寻址附件；
- JSONL 路径边界与意外嵌套目录防护；
- 侧边栏会话菜单入口和独立二次确认弹窗；
- 删除中的禁用状态，以及失败后保留弹窗并显示错误；
- 只有完整 UI 集成挂载成功时才声明 `data-dshw-capability-permanent-delete="true"`。

## 安全适配步骤

1. 获取与目标应用匹配的 DSH 源码，在全新的临时目录和测试 profile 中操作。不得在用户正在使用的源码树、会话目录或 profile 上试验。
2. 备份源码和锁文件，记录提交、根包版本、Node、包管理器和桌面壳版本。
3. 执行只读预检：

   ```sh
   node integrations/dsh-session-delete/preflight.mjs /path/to/DeepSeek-Harness
   ```

4. 只有精确基线才可先检查再应用参考补丁：

   ```sh
   git -C /path/to/clean/DeepSeek-Harness apply --check /path/to/dsh-47f9438-session-delete.patch
   git -C /path/to/clean/DeepSeek-Harness apply /path/to/dsh-47f9438-session-delete.patch
   ```

5. 其他版本请把 `AGENT_PROMPT.md` 和目标源码一起交给 Agent。Agent 必须找到现版本中功能等价的接缝，逐项实现安全约束，不能把补丁硬套上去。
6. 按该源码锁定的版本安装依赖，运行格式、类型检查，以及 persistence、workspace、API proxy、client runtime、workspace browser 的定向测试。
7. 只在隔离测试 profile 中构建验证：开关关闭时菜单入口必须隐藏；开启后才出现；运行中的会话和子会话必须拒绝删除；失败时弹窗不能消失；成功测试只能使用临时创建的会话。
8. 宿主实现通过测试后才允许声明 capability。只在 preload 中伪造能力标记是不合格的实现。
9. 部署时保留上游提交、适配差异、构建日志和可回退构建物。

## 回退

停止隔离测试宿主，恢复之前的构建物，或从未修改的源码重新构建，再用同一测试 profile 启动。插件检测不到宿主 capability 后会自动禁用永久删除。代码回退无法恢复已经永久删除的会话，因此所有删除验证都只能使用临时测试数据。

Windows、macOS 与 Linux 共用同一套功能和安全约束。路径写法可以不同，但不得降低检查标准。上游与许可证信息见 `UPSTREAM-NOTICE.md`。
