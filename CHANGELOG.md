# Changelog

All notable changes to this project are documented here.

## 0.1.2 - 2026-08-15

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
