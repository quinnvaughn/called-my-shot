import { defineConfig } from "vitest/config"

// Never inherits an ambient DATABASE_URL - a shell with the dev database
// exported (or a deployed one) would otherwise get truncated between tests.
// Only TEST_DATABASE_URL can redirect this, and global-setup.ts still
// refuses anything whose database name doesn't end in "_test".
const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL ??
	"postgres://postgres:postgres@localhost:5435/called_my_shot_test"

// Assigned here, at config load, rather than only through `test.env` below:
// globalSetup runs in vitest's main process, which `test.env` (worker-only)
// never reaches.
process.env.DATABASE_URL = TEST_DATABASE_URL
process.env.NODE_ENV = "test"

export default defineConfig({
	// graphql-js rejects a schema built by a different copy of itself
	// ("Cannot use GraphQLSchema from another module or realm"), which is what
	// executing an operation against the real schema in a test would otherwise
	// hit once the loader resolves two instances.
	resolve: { dedupe: ["graphql"] },
	test: {
		globalSetup: ["./src/test/global-setup.ts"],
		setupFiles: ["./src/test/setup.ts"],
		// Every integration test truncates shared tables, so two files running
		// against the same database at the same time would clobber each other.
		// Files in sequence, one worker - the suite is small enough that the
		// lost parallelism costs less than the isolation machinery would.
		pool: "forks",
		fileParallelism: false,
		maxWorkers: 1,
		// db/index.ts reads env.DATABASE_URL at import time, and env.ts parses
		// process.env the moment it is imported - so the test URL has to be in
		// place before any test file pulls in the db.
		env: {
			DATABASE_URL: TEST_DATABASE_URL,
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
