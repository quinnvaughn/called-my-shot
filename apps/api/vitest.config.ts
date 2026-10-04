import { availableParallelism } from "node:os"
import { defineConfig } from "vitest/config"

// Never inherits an ambient DATABASE_URL - a shell with the dev database
// exported (or a deployed one) would otherwise get truncated between tests.
// Only TEST_DATABASE_URL can redirect this, and the suite still refuses
// anything whose database name doesn't end in "_test".
const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL ??
	"postgres://postgres:postgres@localhost:5435/called_my_shot_test"

// One core left for Postgres, which runs on the same machine locally and on
// the CI runner. TEST_WORKERS overrides it.
const TEST_WORKERS = Number(
	process.env.TEST_WORKERS ?? Math.max(1, availableParallelism() - 1),
)

// Assigned here, at config load, rather than only through `test.env` below:
// globalSetup runs in vitest's main process, which `test.env` (worker-only)
// never reaches, and it needs both to clone one database per worker.
process.env.TEST_DATABASE_URL = TEST_DATABASE_URL
process.env.TEST_WORKERS = String(TEST_WORKERS)
process.env.NODE_ENV = "test"

export default defineConfig({
	// graphql-js rejects a schema built by a different copy of itself
	// ("Cannot use GraphQLSchema from another module or realm"), which is what
	// executing an operation against the real schema in a test would otherwise
	// hit once the loader resolves two instances.
	resolve: { dedupe: ["graphql"] },
	test: {
		globalSetup: ["./src/test/global-setup.ts"],
		// worker-env.ts first: it points this worker at its own database before
		// setup.ts pulls in the db.
		setupFiles: ["./src/test/worker-env.ts", "./src/test/setup.ts"],
		// Every integration test truncates every table, so files run in parallel
		// only because each worker has its own database (see
		// src/test/worker-database.ts). VITEST_POOL_ID, which picks it, runs
		// 1..maxWorkers - the same count global-setup.ts clones.
		pool: "forks",
		maxWorkers: TEST_WORKERS,
		env: {
			TEST_DATABASE_URL,
			NODE_ENV: "test",
			CLIENT_ORIGIN: "http://localhost:3000",
		},
		// Pothos builds the schema out of graphql-js classes. Left externalized
		// it loads its own copy of graphql through node while the test's own
		// import goes through vite's resolver, and graphql-js then refuses the
		// schema as coming "from another module or realm". Inlining both puts
		// every importer on one instance.
		server: { deps: { inline: [/@pothos\//, "graphql"] } },
	},
})
