import { writeFileSync } from "node:fs";
import { lexicographicSortSchema, printSchema } from "graphql";
import { schema } from "./schema";

const sdl = printSchema(lexicographicSortSchema(schema));

writeFileSync(new URL("../../schema.graphql", import.meta.url), `${sdl}\n`);
