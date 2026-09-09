# Wallet 0.3.13 verification

Checked on 2026-09-09. Version 0.3.13 changes the version identifiers and documentation; its runtime behavior is the same as 0.3.12. Both published npm archives contain the remote.session dependency fix. The previous claim that 0.3.12 preceded that fix was incorrect.

The local regression suite passed 145/145 tests; build reproducibility, syntax, size and the 15-file package inventory checks passed. Both 0.3.12 and 0.3.13 npm archives were downloaded and verified against the registry SHA-512 integrity values.

The real-profile and browser checks were performed with wallet 0.3.12, not 0.3.13. See [the original compatibility record](compatibility-0.3.12.md) for their scope, the workspace-selection follow-up and the separate Vision Toolkit local adaptation. The daily installed wallet was last verified as 0.3.12. No new 0.3.13 real-profile or paid-API run is claimed here.

GitHub Release and npm publication of 0.3.13 succeeded through Trusted Publishing. DSH STORE re-review remains a separate external outcome.
