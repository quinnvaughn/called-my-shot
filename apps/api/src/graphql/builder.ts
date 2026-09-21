import SchemaBuilder from "@pothos/core"
import DataloaderPlugin from "@pothos/plugin-dataloader"
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
	Scalars: {
		DateTime: { Input: Date; Output: Date }
	}
}

export const builder = new SchemaBuilder<PothosTypes>({
	plugins: [DrizzlePlugin, ErrorsPlugin, DataloaderPlugin],
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

// Every timestamp the API returns, serialised as an ISO 8601 string.
builder.scalarType("DateTime", {
	serialize: (value) => value.toISOString(),
	parseValue: (value) => {
		const date = typeof value === "string" ? new Date(value) : null
		if (!date || Number.isNaN(date.getTime())) {
			throw new TypeError("DateTime must be an ISO 8601 string")
		}
		return date
	},
})
