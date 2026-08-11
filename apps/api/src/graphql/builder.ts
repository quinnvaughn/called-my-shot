import SchemaBuilder from "@pothos/core"
import DrizzlePlugin from "@pothos/plugin-drizzle"
import ErrorsPlugin from "@pothos/plugin-errors"
import { getTableConfig } from "drizzle-orm/pg-core"
import { db } from "../db"
import { relations } from "../db/relations"
import { ValidationError } from "../lib/errors"
import type { Context } from "./context"

export interface PothosTypes {
	DrizzleRelations: typeof relations
	Context: Context
	DefaultFieldNullability: false
}

export const builder = new SchemaBuilder<PothosTypes>({
	plugins: [DrizzlePlugin, ErrorsPlugin],
	defaultFieldNullability: false,
	drizzle: {
		client: db,
		getTableConfig,
		relations,
	},
	errors: {
		defaultTypes: [ValidationError],
	},
})
