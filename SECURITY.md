# Security Policy

## Supported versions

Security fixes are provided for the latest release.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature when it is available. Do not include API keys, account data, wallet files or session logs in a public Issue.

The plugin must never display an unmasked DeepSeek API key or include one in logs, diagnostics, Issues, or browser responses. Multi-account keys are persisted only in encrypted form: Windows uses current-user DPAPI, while other systems use an owner-only AES-GCM key file. The active key is also written to the Harness credentials seam for subsequent model requests and is sent directly by this plugin only as the authorization header to the official `https://api.deepseek.com/user/balance` endpoint.

If an encrypted account file cannot be decrypted, the plugin must fail closed and refuse account writes rather than replacing the unreadable data. The plugin keeps an encrypted `accounts.json.bak` fallback for a missing, corrupt, or undecryptable primary file. On non-Windows systems, `accounts.json`, `accounts.json.bak`, and `accounts.json.key` must be backed up or moved together.

Usage history is stored without prompt or response content in `wallet.json`, with a `wallet.json.bak` recovery copy. If neither file is readable, wallet writes fail closed rather than replacing the unreadable history.
