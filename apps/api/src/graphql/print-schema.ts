import { writeFileSync } from "node:fs"
import { sdl } from "./sdl"

writeFileSync(new URL("../../schema.graphql", import.meta.url), sdl)

// Importing the schema pulls in db/index.ts, whose warmPool() opens pooled
// connections that idleTimeoutMillis: 0 then keeps open for good. Against a
// real DATABASE_URL those sockets keep the event loop alive and this script
// never exits - it only terminates in the Docker build because the throwaway
// placeholder URL there makes the connection fail instead. The file is
// written synchronously above, so there is nothing pending to lose.
process.exit(0)
