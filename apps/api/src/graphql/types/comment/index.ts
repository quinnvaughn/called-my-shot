// Registers the generic comment types and the report queue. Importing this
// directory is what pulls them into the schema (see graphql/schema.ts).
import "./refs"
import "./reports"

export {
	CommentConnectionRef,
	CommentGifInput,
	CommentRef,
	gifInputOf,
	viewerBlockedIdsLoader,
	visibleComments,
} from "./refs"
