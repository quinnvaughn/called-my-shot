import { drizzle } from "drizzle-orm/node-postgres"
import { env } from "../env"
import { relations } from "./relations"

// How many connections warmPool() opens at boot - see its own comment below.
const WARM_CONNECTIONS = 5

export const db = drizzle({
	connection: {
		connectionString: env.DATABASE_URL,
		// Passing a bare connection string here used to leave this on
		// node-postgres's default max: 10 - fine for a single simple query
		// per request, but a single GraphQL request can fan out into many
		// more DB round trips than that once you count every field's own
		// resolver (the main query, viewerCall, viewerDispute, viewerReport,
		// per-question/option call counts, ...). Once concurrent requests
		// need more than 10 connections combined, the extras queue waiting
		// for one to free up - time that's invisible in Neon's own query
		// monitoring (it only starts the clock once a query reaches
		// Postgres), so it just shows up as unexplained request latency with
		// nothing slow in the DB dashboard. Neon's pooled endpoint supports
		// up to 10,000 client connections and was sitting near-idle, so
		// there's plenty of headroom to raise this.
		max: 30,
		// node-postgres's pg-pool defaults to idleTimeoutMillis: 10_000 - every
		// connection gets torn down 10s after going idle, and the pool only
		// opens new ones on demand. A single page load fans out into ~8-10
		// concurrent queries (see max's comment above); with zero warm
		// connections between requests, every one of those has to pay a fresh
		// TCP+TLS handshake to Neon (full cert-chain verification, per the
		// verify-full SSL mode) before it can even run. That cost showed up as
		// ~70-250ms per field in Apollo's own field-timing trace despite
		// Query.questions - the actual query - taking under 10ms, and doesn't
		// show up anywhere in Neon's query monitoring since it's a connection-
		// level cost, not a query-level one. Four minutes keeps a connection
		// warm across the ordinary gaps between requests while still closing
		// it before Neon's five idle minutes are up, so an idle pool never
		// stands between the compute and suspending. pg-pool has a `min`
		// option, but it only protects already-open idle connections from
		// eviction - it never opens any itself - so it's useless without
		// something to actually open them eagerly. See warmPool() below for
		// that part.
		idleTimeoutMillis: 4 * 60 * 1000,
	},
	relations,
})

// When Neon suspends the compute it closes every connection, idle ones in
// this pool included. pg-pool reports that as an "error" event on the pool,
// and an EventEmitter with no listener for "error" throws, taking the whole
// process down. The pool has already dropped the dead client by then, and the
// next query opens a fresh one, so logging is all there is to do.
db.$client.on("error", (error) => {
	console.error("[db] idle connection closed:", error.message)
})

// See idleTimeoutMillis's comment above: left alone, the pool starts at zero
// and the first burst of traffic after every deploy/restart pays full TCP+TLS
// handshake cost for each connection it needs. Opening WARM_CONNECTIONS
// connections here, before any real request arrives, moves that cost to boot
// time instead of the first user's page load.
//
// Must never let a failed connection attempt escape as an unhandled
// rejection - `db` gets imported (transitively, via builder/schema) by
// build-time scripts too, like schema:print, which run against a throwaway
// placeholder DATABASE_URL that nothing is listening on. An unhandled
// rejection there crashes the script with ECONNREFUSED, which took down
// the web app's entire deploy pipeline (web's build depends on api's
// printed schema for codegen) even though nothing was actually wrong at
// runtime. Warming the pool is a nice-to-have either way - worth trying,
// never worth crashing the process over.
async function warmPool() {
	const client = db.$client
	await Promise.all(
		Array.from({ length: WARM_CONNECTIONS }, () =>
			client.connect().then((c) => c.release()),
		),
	)
}
warmPool().catch((error) => {
	console.error("warmPool failed, continuing without a warm pool:", error)
})
