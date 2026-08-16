# Changelog

All notable changes to this project are documented here.

## 0.1.4 - 2026-08-17

- Reworked wallet placement around direct manipulation: the chip can stay in the composer, move freely, or snap to the composer bottom, viewport sides, and the main-content divider. Dragging now previews the destination and can cross from one region to another in a single gesture instead of being trapped by an intermediate snap.
- Added compact horizontal and vertical dock layouts, narrowed the side-dock frame without shrinking its text, and kept every vertical value directly below its label. When a narrow composer cannot fit the full home chip, it now preserves a clickable 44px balance/token value instead of overflowing under the model selector.
- Added a 75–125% live scale slider and independent official/third-party visibility controls, while preventing both data sources from being hidden at once.
- Made the details panel draggable with a remembered, viewport-clamped position. “Minimize” now goes directly to a freely movable circular wallet instead of creating a second floating state.
- Expanded conversation-completion reminders with persistent or timed dismissal, simultaneous-completion queueing, deduplication, cross-tab ownership, click-to-open behavior, and an in-page fallback when system notifications cannot be delivered.
- Added a single desktop-wrapper compatibility adapter for notifications, notification permission, local storage, external links, and optional host capabilities. Synchronous, fire-and-forget, Promise-based, and failure-fallback notification bridges are covered by regression tests.
- Added a host-gated permanent-deletion preference. The npm plugin exposes the preference only when the surrounding DSH host advertises a real deletion implementation; unsupported hosts show a disabled control. The separate “clear wallet data” action was renamed and documented to make clear that it removes only this conversation's wallet counters, not the conversation.
- Added a versioned Agent host-integration kit for permanent deletion: bilingual guides, a complete adaptation prompt, compatibility manifest, read-only preflight, upstream/license notice, and a reference patch pinned to DSH commit `47f943859bef60e4160492346772ded9b24f765a` (`0.1.0-rc.5`). The npm plugin still does not claim to be the deletion engine.
- Tightened the control-panel layout and labels without reducing the base font size, including clearer completion-reminder and permanent-deletion controls.
- Replaced screenshot-dependent README sections with detailed English and Chinese product introductions, package-safe language navigation, explicit compatibility evidence levels, and clearer trust and host-capability boundaries.
- Expanded the zero-dependency test suite with release metadata, documentation-resource, HTTP route-boundary, layout, reminder, desktop fallback, and capability-gating checks; added exact npm archive verification for the 0.1.4 release candidate.
- Expanded validation to Windows, Ubuntu, and macOS on Node 22.19 and 24, added cross-platform reference-patch checks and focused DSH deletion-chain tests, and added npm OIDC trusted publishing for formal GitHub Releases.

## 0.1.3 - 2026-08-16

- Fixed the recharge shortcut so its first click reliably opens the anti-phishing confirmation, including when the detail panel is closed (contributed in PR #2 by QZYWQ).
- Fixed the detail panel opening below the viewport; it now uses viewport-aware fixed positioning and flips above the chip when needed.
- Session cost is now accumulated at the price active when each usage event arrives, so historical spend no longer changes at peak/off-peak or policy boundaries. Existing stores migrate once to schema v2 and keep the migrated estimate.
- Added currency-aware balance formatting and stopped applying the CNY low-balance threshold to non-CNY accounts.
- Reworked floating drag with pointer events for mouse and touch, fixed click-without-drag crashes, and clamp positions using the actual dot/window dimensions.
- Replaced nested clickable markup with native buttons, added dialog semantics, focus handling, Escape support, and keyboard focus styles.
- Moved the interactive chip to the Harness `conversation.input.left` slot, deduplicated concurrent balance refreshes, and flush pending persisted changes during plugin shutdown.
- Expanded regression coverage and CI to run tests and package verification on Linux and Windows with Node 22 and 24.
- Added capability-based browser/desktop adaptation: optional wrapper bridges for notifications, storage, and external links; in-page notification, cross-tab lease, and CSS-scale fallbacks; and host capability discovery that disables unsupported permanent-delete controls instead of exposing a dead switch.
- Fixed completion reminders for the currently selected conversation by detecting its running-to-idle transition; desktop notification bridges now also support fire-and-forget, Promise-based, and native callback APIs.

## 0.1.2 - 2026-08-15

- Fixed the client bundle loader id to match the package name (`deepseek-harness-wallet`); 0.1.1 still registered the old `dsh-wallet` id, which aborted the whole plugin boot ("loaded without registering") after the rename. Regression test added.
- Implemented the 2026-08-17 peak/off-peak pricing for the v4 models (Beijing 09:00–12:00 / 14:00–18:00 peak; off-peak is half the peak rate).
- Fixed the v4 pricing effective date in the READMEs (2026-04-24, matching the V4 preview launch).
- Balance total now prefers the CNY record and never sums mixed currencies (fixes wrong totals and false low-balance alerts on international accounts).
- Hardened the persisted store: threshold values are coerced on load, saves are atomic (temp file + rename), and boot-retry timers are cleaned up on plugin stop.
- Floating window drag now clamps by the dragged element's real size, so the panel can no longer be pushed mostly off-screen.

## 0.1.1 - 2026-08-14

- Added floating window mode: detach the wallet panel into a draggable floating window with a persistent position, or minimize it to a dot that turns red when the balance is below the threshold.
- Replaced the control-panel screenshot with floating-window screenshots in the READMEs.

## 0.1.0 - 2026-08-14

- Initial public release.
- Added official DeepSeek balance monitoring and manual refresh.
- Added per-session DeepSeek cost estimation and provider-aware token counters.
- Added configurable low-balance alerts and desktop notifications.
- Added a guarded shortcut to the official DeepSeek recharge page.
- Added English and Simplified Chinese documentation.
