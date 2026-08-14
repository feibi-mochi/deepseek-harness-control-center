# Security Policy

## Supported versions

Security fixes are provided for the latest release.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature when it is available. Do not include API keys, account data, wallet files or session logs in a public Issue.

The plugin must never display or persist the DeepSeek API key. Its only intended credential use is the authorization header sent to the official `https://api.deepseek.com/user/balance` endpoint.
