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
	},
	relations,
})
