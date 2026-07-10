# Phase 1 Rollback Runbook

## Scope
Rollback guidance for AUTH/LOCL/PROF flows in Phase 1.

## Steps
1. Disable profile mutation handlers by returning HTTP 503 from profile confirm and revert endpoints.
2. Keep login and locale read flow enabled to avoid lockout.
3. If auth token issues occur, clear verification and reset token tables for non-production only.
4. Re-enable handlers after fix and redeploy.
