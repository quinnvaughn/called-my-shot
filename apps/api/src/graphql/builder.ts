import SchemaBuilder from "@pothos/core"
import DrizzlePlugin from "@pothos/plugin-drizzle"
import { getTableConfig } from "drizzle-orm/pg-core"
import { db } from "../db"
import { relations } from "../db/relations"
import type { Context } from "./context"

export interface PothosTypes {
	DrizzleRelations: typeof relations
	Context: Context
}

export const builder = new SchemaBuilder<PothosTypes>({
	plugins: [DrizzlePlugin],
	drizzle: {
		client: db,
		getTableConfig,
		relations,
	},
})
