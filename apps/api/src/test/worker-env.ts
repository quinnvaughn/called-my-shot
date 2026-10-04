import { workerDatabaseUrl } from "./worker-database"

// Listed before setup.ts in vitest.config.ts's setupFiles: db/index.ts reads
// env.DATABASE_URL at import time, so this worker's database has to be in
// place before setup.ts (or any test file) pulls in the db.
const baseUrl = process.env.TEST_DATABASE_URL
if (!baseUrl) {
	throw new Error("TEST_DATABASE_URL is not set (see vitest.config.ts)")
}
process.env.DATABASE_URL = workerDatabaseUrl(
	baseUrl,
	Number(process.env.VITEST_POOL_ID ?? "1"),
)
