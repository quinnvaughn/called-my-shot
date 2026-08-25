import { drizzle } from "drizzle-orm/node-postgres"
import { env } from "../env"
import { relations } from "./relations"

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
		// node-postgres's pg-pool defaults to min: 0 and idleTimeoutMillis:
		// 10_000 - every connection gets torn down 10s after going idle, and
		// the pool only opens new ones on demand. A single page load fans out
		// into ~8-10 concurrent queries (see max's comment above); with zero
		// warm connections between requests, every one of those has to pay a
		// fresh TCP+TLS handshake to Neon (full cert-chain verification, per
		// the verify-full SSL mode) before it can even run. That cost showed
		// up as ~70-250ms per field in Apollo's own field-timing trace despite
		// Query.questions - the actual query - taking under 10ms, and doesn't
		// show up anywhere in Neon's query monitoring since it's a connection-
		// level cost, not a query-level one. Keeping a handful of connections
		// permanently warm (min) and giving idle ones much longer to live
		// (idleTimeoutMillis) means most requests reuse an already-established
		// connection instead of paying handshake cost on the hot path.
		min: 5,
		idleTimeoutMillis: 300_000,
	},
	relations,
})
