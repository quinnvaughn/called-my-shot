// Registers every post GraphQL type, query and mutation with the builder,
// plus what posts add to prompts, comments, groups, users and teams.
// Importing this directory is what pulls them into the schema (see
// graphql/schema.ts).
import "./refs"
import "./prompt-fields"
import "./redraft-fields"
import "./comment-fields"
import "./queries"
import "./mutations"
import "./reports"

export {
	PostConnectionRef,
	PostInterfaceRef,
	RedraftPostRef,
	RushmorePostRef,
} from "./refs"
