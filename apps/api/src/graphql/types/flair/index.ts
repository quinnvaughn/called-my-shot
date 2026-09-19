// Registers every flair GraphQL type, query and mutation with the builder.
// Importing this directory is what pulls them into the schema (see
// graphql/schema.ts) - the modules below have no other entry point.
import "./enums"
import "./refs"
import "./queries"
import "./mutations"

export { FlairSourceEnum, FlairUnlockEnum } from "./enums"
export { FlairRef } from "./refs"
