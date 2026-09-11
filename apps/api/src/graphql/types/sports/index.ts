// Registers every sports-catalog GraphQL type, query and mutation with the
// builder. Importing this directory is what pulls them into the schema (see
// graphql/schema.ts) - the modules below have no other entry point.
import "./enums"
import "./league"
import "./team"
import "./game"
import "./game-starter"
import "./catalog"
import "./admin-connections"
import "./windows"
import "./queries"
import "./inputs"
import "./mutations"

// The public surface other type modules build on - everything else stays
// internal to this directory. The queries and mutations are registered by the
// side-effect imports above, never referenced by name from outside.
export { PlayerRef, StatRef } from "./catalog"
export { GameRef } from "./game"
export { LeagueRef, SeasonRef, SportRef } from "./league"
export { TeamRef } from "./team"
