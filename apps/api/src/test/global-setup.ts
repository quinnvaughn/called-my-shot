import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { Client } from "pg"
import {
	assertIsATestDatabase,
	databaseName,
	workerDatabaseUrl,
} from "./worker-database"

const API_DIR = fileURLToPath(new URL("../..", import.meta.url))

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

// CREATE DATABASE ... TEMPLATE copies the migrated base at the file level,
// which takes milliseconds where replaying the migrations per worker would
// take seconds. It has to run from another database, since Postgres refuses
// to copy a template anything is connected to.
async function cloneWorkerDatabases(baseUrl: string, workers: number) {
	const maintenanceUrl = new URL(baseUrl)
	maintenanceUrl.pathname = "/postgres"
	const client = new Client({ connectionString: maintenanceUrl.toString() })
	await client.connect()
	try {
		const template = databaseName(baseUrl)
		for (let poolId = 1; poolId <= workers; poolId++) {
			const name = databaseName(workerDatabaseUrl(baseUrl, poolId))
			await client.query(`drop database if exists "${name}" with (force)`)
			await client.query(`create database "${name}" template "${template}"`)
		}
	} finally {
		await client.end()
	}
}

// Drops and rebuilds the base schema from the real migrations rather than
// from drizzle-kit push - the suite should run against the same DDL
// production gets, so a migration that is wrong or missing fails here instead
// of at deploy time. Each worker's database is then cloned from it.
export async function setup() {
	const url = process.env.TEST_DATABASE_URL
	if (!url) {
		throw new Error("TEST_DATABASE_URL is not set (see vitest.config.ts)")
	}
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

	await cloneWorkerDatabases(url, Number(process.env.TEST_WORKERS ?? "1"))
}
