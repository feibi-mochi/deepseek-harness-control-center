# Contributing

Thanks for helping improve the DeepSeek Harness Balance Monitor & Recharge Plugin.

## Before opening an Issue

- Search existing Issues first.
- State your DeepSeek Harness version, operating system and Node.js version.
- Describe the expected result and the actual result.
- Remove API keys, wallet data, session content, account information and local paths from screenshots and logs.

## Pull requests

1. Keep the plugin dependency-free unless a dependency removes substantially more code than it adds.
2. Preserve provider and session isolation.
3. Keep the recharge destination fixed to the official DeepSeek URL.
4. Run the validation commands before submitting:

   ```shell
   node --check index.js
   node --check lib/client.js
   node -e "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8'))"
   node --test
   ```

Issues and pull requests are welcome in English or Chinese.
