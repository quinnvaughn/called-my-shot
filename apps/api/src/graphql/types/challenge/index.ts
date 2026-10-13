// Registers every challenge GraphQL type, query and mutation with the
// builder. Importing this directory is what pulls them into the schema (see
// graphql/schema.ts).
import "./refs"
import "./queries"
import "./mutations"
import "./gloats"

export { ChallengeRef } from "./refs"
