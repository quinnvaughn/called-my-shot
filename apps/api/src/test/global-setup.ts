import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { Client } from "pg"

const API_DIR = fileURLToPath(new URL("../..", import.meta.url))

// The integration suite truncates every table between tests, so pointing it
// at the wrong database destroys real data. Both of these are hard refusals
// rather than warnings: the dev database (called_my_shot on 5433) and any
// deployed one would both sail past a softer check.
function assertIsATestDatabase(url: string) {
	const name = new URL(url).pathname.replace(/^\//, "")
	if (!name.endsWith("_test")) {
		throw new Error(
			`Refusing to run tests against "${name}" - the test database's name ` +
				`must end in "_test" (the suite truncates every table). Set ` +
				`TEST_DATABASE_URL, or start the bundled one with ` +
				`\`docker compose up -d postgres-test\`.`,
		)
	}
}

async function waitForPostgres(url: string) {
	const deadline = Date.now() + 30_000
	let lastError: unknown
	while (Date.now() < deadline) {
		const client = new Client({ connectionString: url })
		try {
			await client.connect()
			await client.end()
			return
		} catch (error) {
			lastError = error
			await new Promise((resolve) => setTimeout(resolve, 500))
		}
	}
	throw new Error(
		`Could not reach the test database at ${url} after 30s. Start it with ` +
			`\`docker compose up -d postgres-test\` from the repo root.\n` +
			`Last error: ${lastError}`,
	)
}

// Drops and rebuilds the schema from the real migrations rather than from
// drizzle-kit push - the suite should run against the same DDL production
// gets, so a migration that is wrong or missing fails here instead of at
// deploy time.
export async function setup() {
	const url = process.env.DATABASE_URL
	if (!url) throw new Error("DATABASE_URL is not set (see vitest.config.ts)")
	assertIsATestDatabase(url)
	await waitForPostgres(url)

	const client = new Client({ connectionString: url })
	await client.connect()
	await client.query("drop schema if exists public cascade")
	await client.query("create schema public")
	await client.query("drop schema if exists drizzle cascade")
	await client.end()

	execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
		cwd: API_DIR,
		env: { ...process.env, DATABASE_URL: url },
		stdio: "inherit",
	})
}
