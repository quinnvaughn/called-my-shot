// Each vitest worker runs against its own copy of the test database, cloned
// from the migrated base one in global-setup.ts, so files in different
// workers can truncate between tests without wiping each other's rows.

export function databaseName(url: string): string {
	return new URL(url).pathname.replace(/^\//, "")
}

// The integration suite truncates every table between tests, so pointing it
// at the wrong database destroys real data. A hard refusal rather than a
// warning: the dev database (called_my_shot on 5433) and any deployed one
// would both sail past a softer check.
export function assertIsATestDatabase(url: string) {
	const name = databaseName(url)
	if (!name.endsWith("_test")) {
		throw new Error(
			`Refusing to run tests against "${name}" - the test database's name ` +
				`must end in "_test" (the suite truncates every table). Set ` +
				`TEST_DATABASE_URL, or start the bundled one with ` +
				`\`docker compose up -d postgres-test\`.`,
		)
	}
}

// called_my_shot_test -> called_my_shot_w3_test, keeping the "_test" suffix
// the check above insists on.
export function workerDatabaseUrl(baseUrl: string, poolId: number): string {
	assertIsATestDatabase(baseUrl)
	const url = new URL(baseUrl)
	url.pathname = `/${databaseName(baseUrl).replace(/_test$/, "")}_w${poolId}_test`
	return url.toString()
}
