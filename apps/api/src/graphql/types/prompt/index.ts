// Registers the prompt GraphQL types, queries and mutations with the
// builder. Importing this directory is what pulls them into the schema (see
// graphql/schema.ts).
import "./refs"
import "./queries"
import "./mutations"

export { RushmorePromptRef } from "./refs"
