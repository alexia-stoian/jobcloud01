# Phase 1 Verification Checklist

## Requirement mapping
- AUTH-01..AUTH-04: covered by auth API routes and auth tests.
- LOCL-01..LOCL-03: covered by locale config tests and language switcher e2e visibility.
- PROF-01..PROF-12: covered by profile summary/chat routes and completion/history tests.

## Decision-specific checks
- Chat-only profile editing: direct PATCH rejected unless chat_confirmed/system_revert source.
- Soft warnings: warnings returned when permit is missing.
- Minimal completion gate: name/location/role/language/permit required for complete state.
- Full history trail: history event created with each confirmed mutation.
- Permit required, salary optional: validated in mutation service behavior.
- Explicit confirmation before apply: confirm endpoint requires confirmationAccepted=true.
