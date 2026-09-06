import { sql } from "drizzle-orm"
import { afterAll, beforeEach } from "vitest"
import { db } from "../db"

// Discovered from the live database rather than listed by hand, so a new
// table added to db/schema is cleaned up between tests without anyone having
// to remember this file exists. `drizzle` (the migrations bookkeeping schema)
// is excluded - wiping it would make every later run re-apply migrations.
let truncateStatement: string | null = null

async function getTruncateStatement() {
	if (truncateStatement) return truncateStatement
	const { rows } = await db.$client.query<{ table_name: string }>(
		`select table_name from information_schema.tables
		 where table_schema = 'public' and table_type = 'BASE TABLE'`,
	)
	const tables = rows.map((row) => `"public"."${row.table_name}"`)
	// One statement, cascade, restart identity: order-independent (no need to
	// work out the FK topology) and resets sequences so ids don't drift across
	// tests.
	truncateStatement = `truncate table ${tables.join(", ")} restart identity cascade`
	return truncateStatement
}

beforeEach(async () => {
	await db.execute(sql.raw(await getTruncateStatement()))
})

// db/index.ts opens a pool at import time with idleTimeoutMillis: 0, so
// without this the connections stay open and vitest hangs after the last
// test instead of exiting.
afterAll(async () => {
	await db.$client.end()
})
