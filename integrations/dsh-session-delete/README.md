# Agent-assisted DSH permanent-session deletion

DeepSeek Harness Control Center can expose a permanent-delete preference, but the npm plugin deliberately does not own DSH session storage or the workspace sidebar. A real delete action therefore requires a buildable DSH host integration. This directory supplies a versioned, reviewable reference for an Agent to adapt; it is not a one-click installer and is not an official DeepSeek feature.

## Compatibility boundary

The bundled patch targets exactly:

- upstream: `https://github.com/deepseek-ai/DeepSeek-Harness`
- commit: `47f943859bef60e4160492346772ded9b24f765a`
- root package version at that commit: `0.1.0-rc.5`
- patch SHA-256: `b43b806c0856cf07889d5659f0d5ff3fd3b460696fb3a1a12a29e3b3c7b411a6`

The globally distributed `dsh 0.1.0-rc.6` is not this patch baseline. On any other commit or package version, an Agent must inspect the current code and port the behavior by meaning. Never use three-way or reject-producing flags to force this patch onto a different tree.

Closed-source desktop applications and wrappers that cannot rebuild their matching DSH source cannot receive this host feature. Browser, Electron, and Tauri surfaces can use it only when they retain the DSH Web plugin loader, client runtime, session persistence, API proxy, and workspace UI seams.

## What the reference implements

- a validated `session.delete` request/response contract and client runtime call;
- JSONL and SQLite durable deletion behind the persistence service;
- ownership, running-state, subagent, queued-write, and prepared-resume safety checks;
- safe disposal of an idle session owned by the current Web runtime;
- workspace membership and archive-reference cleanup before log deletion;
- retention of shared content-addressed attachments;
- JSONL path containment and unexpected nested-directory refusal;
- a sidebar session-menu command with a separate destructive confirmation dialog;
- an in-dialog pending state and retryable error state;
- `data-dshw-capability-permanent-delete="true"` only while the working UI integration is mounted.

## Safe procedure

1. Obtain a clean, disposable checkout of the DSH source that actually backs the target application. Never experiment in a user's live profile or data directory.
2. Back up the source and its lockfile. Record `git rev-parse HEAD`, the root package version, Node version, package-manager version, and wrapper version.
3. Run the read-only preflight:

   ```sh
   node integrations/dsh-session-delete/preflight.mjs /path/to/DeepSeek-Harness
   ```

4. Only on the exact pinned baseline, verify the patch before applying it:

   ```sh
   git -C /path/to/clean/DeepSeek-Harness apply --check /path/to/dsh-47f9438-session-delete.patch
   git -C /path/to/clean/DeepSeek-Harness apply /path/to/dsh-47f9438-session-delete.patch
   ```

5. For another DSH version, give `AGENT_PROMPT.md` to an Agent together with the target checkout. The Agent must locate the current equivalents of every seam and implement the same invariants instead of applying the patch.
6. Install the exact dependencies required by that checkout and run its format/type gates plus the focused persistence, workspace, API proxy, client-runtime, and workspace-browser tests.
7. Build into an isolated test profile. Verify the menu stays absent while the wallet preference is off, appears after opt-in, refuses a running or subagent-owned session, keeps the confirmation dialog open on failure, and succeeds only on temporary test sessions.
8. Verify the wallet sees the capability attribute only after the host implementation has passed its tests. Do not advertise the capability from a preload script alone.
9. Deploy only the reviewed build. Keep the original source commit, patch/adaptation diff, build logs, and rollback artifact together.

## Rollback

Stop the disposable test host, restore the previously built host artifact or rebuild the untouched source checkout, then restart with the same profile. The plugin will detect that the host capability is absent and disable permanent deletion. A session already permanently deleted cannot be restored by rolling back code; deletion tests must therefore use disposable data only.

Windows, macOS, and Linux use the same behavioral contract. The commands above intentionally avoid shell-specific file operations; path syntax may differ, but the safety checks must not. See `README.zh-CN.md` for the Chinese guide and `UPSTREAM-NOTICE.md` for provenance and licensing.
