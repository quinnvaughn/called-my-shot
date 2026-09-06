import { lexicographicSortSchema, printSchema } from "graphql"
import { schema } from "./schema"

// Sorted so the output is stable across builds - Pothos emits types in
// whatever order the ./types modules happened to import them, which would
// otherwise make every unrelated schema print produce a different string and
// turn the deploy-gate diff into noise.
export const sdl = `${printSchema(lexicographicSortSchema(schema))}\n`
