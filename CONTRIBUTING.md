# Contributing

Thanks for helping improve the DeepSeek Harness Balance Monitor & Recharge Plugin.

## Before opening an Issue

- Search existing Issues first.
- State your DeepSeek Harness version, operating system and Node.js version.
- Describe the expected result and the actual result.
- Remove API keys, wallet data, session content, account information and local paths from screenshots and logs.

## Pull requests

1. Keep the plugin free of runtime dependencies. Client build tooling is pinned in `package-lock.json`.
2. Preserve provider and session isolation.
3. Keep the recharge destination fixed to the official DeepSeek URL.
4. Run the validation commands before submitting:

   ```shell
   npm ci
   npm run build:client
   npm run check:client
   npm run check:syntax
   npm test
   npm run check:pack
   ```

Edit the five readable modules in `src/client/`, then commit the regenerated `lib/client.js`. Installation consumes the committed bundle directly and runs no build scripts. Platform adaptation lives in `src/client/core.js`. See [compatibility evidence](docs/compatibility-0.3.10.md) for disposable-profile checks.

Issues and pull requests are welcome in English or Chinese.
