// Registers every group GraphQL type, query and mutation with the builder.
// Importing this directory is what pulls them into the schema (see
// graphql/schema.ts) - the modules below have no other entry point.
import "./enums"
import "./leaderboard"
import "./highlights"
import "./refs"
import "./preview"
import "./inputs"
import "./queries"
import "./mutations"
import "./pins"
import "./ballots"
import "./game-board"
import "./ballot-board"
import "./pressers"
import "./recaps"
import "./record-book"
import "./still-open"
import "./week-race"

// The public surface other modules build on - everything else stays internal
// to this directory. The queries and mutations are registered by the
// side-effect imports above, never referenced by name from outside.
export { GroupPayload } from "./inputs"
export { GroupMemberRef, GroupRef, QuestionShareRef } from "./refs"
