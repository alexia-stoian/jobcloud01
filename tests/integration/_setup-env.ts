// Side-effect module: sets the minimal env vars required by `@/lib/env` so
// modules that validate env at import time (e.g. sourcing/report) can be
// imported in unit tests. Import this BEFORE any such module.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_SECRET ??= "test-secret";

export {};
