# Agent adaptation prompt

Use the following prompt with a coding Agent that has access to the exact, buildable DSH source used by the target browser or desktop application.

---

You are adapting a buildable DeepSeek Harness host so DeepSeek Harness Control Center can offer real permanent-session deletion. Work only in a clean disposable checkout and a disposable test profile. Never delete, rewrite, migrate, or inspect the contents of a real user's sessions while testing.

First record the repository URL, exact commit, root package version, Node version, package manager, lockfile, OS, and wrapper type. Run the bundled read-only `preflight.mjs`. The bundled patch applies only to commit `47f943859bef60e4160492346772ded9b24f765a`, root version `0.1.0-rc.5`. If either differs, do not force, partially apply, or three-way apply the patch. Read the current source and port the following behavior to its current architecture.

Implement and test all of these requirements:

1. Add a typed `session.delete` host request and `{ deleted: true }` success response. Validate request and response at every transport boundary and return structured errors for not found, running, subagent-owned, owner mismatch, and internal failures.
2. Expose the call through the client API, manager, and public Session runtime. Do not make the UI mutate its local list before the host confirms success.
3. Add a persistence deletion seam. JSONL must resolve only the exact session artifact beneath the configured root, unlink symlinks/junction-shaped entries as leaves, refuse unexpected real nested directories, and never recurse. SQLite must delete the session row transactionally and rely only on reviewed foreign-key cascades. Both backends must return whether an artifact existed.
4. Serialize deletion with queued writes and retirement. Reject deletion while a live Session or exclusive resume preparation owns the identity; invalidate only an idle cached preparation. Permit the id to be safely reused after deletion.
5. At the host API, wait for in-flight create/resume, reject session-backed subagents, and reject running agents. If the current Web runtime owns an idle agent handle, dispose it and verify the live Session owner is gone. If another runtime owns it, reject rather than stealing ownership.
6. Before removing persistence, remove the session from every Workspace and from the archive set, and prune stale archived ids at startup. If the final durable delete fails, the operation must remain safely retryable without Workspace rows pointing to a missing log.
7. Keep shared content-addressed attachment blobs. Do not guess that an attachment is unreferenced and do not add recursive attachment cleanup.
8. Broadcast the normal host session-removed event exactly once so all tabs update. Keep stream subscribers correctly registered and removed.
9. Add a session-row menu item only for materialized ordinary sessions and only while the wallet preference `dshw-permanent-delete-v1` is true. Use an independent confirmation modal that says deletion is irreversible, running sessions must be stopped, and shared images remain. Block duplicate submission. On failure, keep the modal open and show the error so the user can retry or cancel.
10. While and only while the complete workspace UI integration is mounted, set `data-dshw-capability-permanent-delete="true"` on the document root and dispatch `dshw-host-capabilities-change`; restore the previous value on unmount. Never advertise capability merely because a preload bridge or the wallet asks for it.
11. Preserve existing archive, rename, fork, search, workspace, persistence, and stream behavior. Do not add OS-specific branches to the contract; Windows, macOS, and Linux must follow the same semantics.

Add focused tests for JSONL and SQLite deletion/reuse, path traversal and unexpected nested directories, prepared/live ownership, Workspace/archive cleanup, running and subagent refusal, idle owned-handle disposal, transport schemas, runtime propagation, menu gating, confirmation, duplicate blocking, error persistence, capability lifecycle, and multi-tab removal delivery. Every deletion test must create its own temporary session data.

Install only the dependencies locked by this DSH checkout. Run its formatting, type checks, and focused tests. Build an isolated host and perform UI verification without paid model calls. If the source is closed, the matching source cannot be rebuilt, or any required seam is absent and cannot be implemented safely, stop and report that this desktop build is unsupported. Do not fake the capability flag.

Before handoff, provide: the exact adapted commit, reviewed diff, tests run and counts, temporary-data proof, supported host build, rollback artifact, and any behavior that could not be verified on real Windows, macOS, or Linux devices.

---
