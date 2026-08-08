import SchemaBuilder from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { getTableConfig } from "drizzle-orm/pg-core";
import { db } from "../db";
import { relations } from "../db/relations";

export interface PothosTypes {
	DrizzleRelations: typeof relations;
}

export const builder = new SchemaBuilder<PothosTypes>({
	plugins: [DrizzlePlugin],
	drizzle: {
		client: db,
		getTableConfig,
		relations,
	},
});
