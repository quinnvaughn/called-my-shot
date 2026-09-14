// Registers every user GraphQL type, query and mutation with the builder.
// Importing this directory is what pulls them into the schema (see
// graphql/schema.ts) - the modules below have no other entry point.
import "./enums"
import "./refs"
import "./stats"
import "./inputs"
import "./queries"
import "./mutations"
import "./onboarding"
import "./admin-report"

// The public surface other modules build on - everything else stays internal
// to this directory. The queries and mutations are registered by the
// side-effect imports above, never referenced by name from outside.
export { StreakFamilyEnum } from "./enums"
export { QuestionVoidRef, UserRef } from "./refs"
