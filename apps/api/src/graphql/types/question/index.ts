// Registers every question-side GraphQL type, query and mutation with the
// builder. Importing this directory is what pulls them into the schema (see
// graphql/schema.ts) - the modules below have no other entry point.
import "./enums"
import "./call"
import "./question-object"
import "./fade"
import "./moderation-objects"
import "./admin-queue"
import "./inputs"
import "./queries"
import "./mutations/create-question"
import "./mutations/cast-call"
import "./mutations/fade"
import "./mutations/redo-call"
import "./mutations/resolution"
import "./mutations/moderation"

// The public surface other type modules build on - everything else stays
// internal to this directory. The queries and mutations are registered by the
// side-effect imports above, never referenced by name from outside.
export { CallConnectionRef, CallRef } from "./call"
export { QuestionShape, VoidReason } from "./enums"
export { QuestionConnectionRef, QuestionRef } from "./question-object"
