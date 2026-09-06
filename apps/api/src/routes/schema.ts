import type { Express } from "express"
import { sdl } from "../graphql/sdl"

// Serves the running server's own schema so a deploy can check the frontend's
// queries against what is actually live, rather than against the schema
// generated from whatever commit the frontend image happened to build from.
//
// Deliberately not Apollo's introspection: introspection is off in production
// (Apollo defaults it to NODE_ENV !== "production") and turning it on would
// accept arbitrary __schema queries on the same endpoint that serves real
// data. This is one static string on a separate GET route.
//
// The SDL is public - anyone can read the type graph. That is the same
// information introspection would expose and it carries no data, but it does
// mean field names land in public view the moment they deploy. Gate it behind
// a shared secret if that stops being acceptable.
export function registerSchemaRoute(app: Express) {
	app.get("/schema.graphql", (_req, res) => {
		// The deploy gate compares against what this machine is running right
		// now, so a cached copy would let a stale schema pass the check.
		res.setHeader("cache-control", "no-store")
		res.type("text/plain").send(sdl)
	})
}
