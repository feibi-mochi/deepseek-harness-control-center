# Wallet 0.3.12 / DSH 0.1.5-alpha.1 verification

Local verification on 2026-09-09, Windows, Node 24.18.1. This is an unpublished wallet update. DSH was installed from the official npm package at exact version 0.1.5-alpha.1 in a separate runtime directory; the lifecycle runner checks matching DSH dependency versions against its lockfile.

## Verified scope

- Disposable profile: install packed wallet 0.3.12, Web cold start, authenticated health/preferences endpoints, client bundle delivery, removal and cold restart, rollback to wallet 0.3.11 and cold start. All passed.
- Browser baseline on wallet 0.3.11 with this host: settings registration and rendering, account controls without real credentials, Z.ai unconfigured states, 365-day heatmap, and a synthetic third-party price save. The permanent-delete switch correctly remained disabled.
- After updating that disposable profile to wallet 0.3.12 and restarting, the browser showed the new version and compatibility label, the saved synthetic price rule remained present, and dark-theme rendering passed visual inspection. Earlier light-theme rendering was checked on the 0.3.11 baseline.
- Existing alpha.3 profile copied to a separate data directory: new host cold start and wallet health passed. The original source, original data, and a separate pre-upgrade backup remain intact. Existing Vision Toolkit and skin dependencies were retained.
- Daily Web on port 3080 now reports host 0.1.5-alpha.1 and wallet 0.3.12 with an unlocked ledger. Vision Toolkit and the skin manager are in the client boot graph. Maid Atelier was disabled in the old profile and remains disabled; it was not enabled for this validation.
- The published host still exposes the wallet's llm/stream options, usage fields, session list/model directory services and UI slots. Wallet does not use the removed ctx.agent / Inbox APIs or read DSH session logs directly; its own ledger format is unchanged.

## Limits

No real API key was used in the disposable profile, and no paid model calls were made for validation. Browser/API smoke checks do not prove every provider, skin, operating system or desktop wrapper is compatible. Previous 0.1.2 compatibility declarations retain their historical evidence; 0.1.3 releases and future versions have not been added as verified.

DSH 0.1.5-alpha.1 uses session format V3. Sessions migrated by the new host are not readable by the old host; rollback must use the preserved old data directory. The wallet's old permanent-delete integration patch has not been ported to this host and must not be force-applied.

## Reproduce

Run `node scripts/verify-dsh-profile.mjs <pinned-cli-root> <wallet-0.3.12.tgz> <wallet-0.3.11.tgz> <unused-port> 0.3.12 0.3.11`. Use a fresh profile and synthetic fixtures. The script does not copy the user's credentials or session data.

GitHub publication, npm publication and DSH STORE review are separate operations. This local verification does not claim any of them has occurred for 0.3.12.

The initial checks above did not exercise workspace selection/session creation and were insufficient to establish daily usability. Follow-up on 2026-09-09 reproduced two errors: wallet model-directory calls lacked caller injection of remote.session, and the retained Vision Toolkit 0.1.40-alpha3.1 attempted to iterate the removed session.events field.

Wallet now declares remote and remote.session at root and composer scopes. The daily profile uses upstream Vision Toolkit 0.1.43 runtime code (which reads snapshotEvents), locally packaged as 0.1.43-dsh015.1 with its obsolete dsh-client-runtime manifest reference replaced by dsh-api-session-controller; no node_modules file was hand-edited. This is a separate local compatibility package, not an upstream release.

Edge verification after restart: selected each existing workspace and returned to DeepSeek work, created/selected an empty session, verified the composer accepts text and enables Send, cleared the unsent test draft, and observed wallet/model selector/clock rendering without new remote.session or session.events errors. No paid model request was sent. A same-filename local tarball initially reused cached code; installation through a distinct archive path and runtime/source SHA-256 equality confirmed the corrected artifact was installed.

Local regression suite: 145 tests, including a caller-injection regression. One editorial test enforcing the retired promotional headings and minimum prose length was removed; behavior and documentation-boundary tests remain. Client build reproducibility, syntax, store size, and the 15-file package inventory checks passed; the client artifact is 256,569 bytes. See the GitHub Validate run for the uploaded commit for cross-platform results.
