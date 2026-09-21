import { eq, type InferSelectModel } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
import type { z } from "zod"
import type { Tx } from "../db/types"
import { NotFoundError, ValidationError } from "../lib/errors"

// Parses a mutation's input, surfacing any zod issues as the ValidationError
// union member every mutation already declares.
export function parseInput<S extends z.ZodType>(
	schema: S,
	input: unknown,
): z.output<S> {
	const parsed = schema.safeParse(input)
	if (!parsed.success) throw ValidationError.fromZodIssues(parsed.error.issues)
	return parsed.data
}

// Reads one row by id under a row lock, for mutations that check a row's
// state and then write it inside the same transaction.
export async function lockOrThrow<T extends PgTable & { id: PgColumn }>(
	tx: Tx,
	table: T,
	id: string,
	notFoundMessage: string,
): Promise<InferSelectModel<T>> {
	const [row] = await tx
		.select()
		.from(table as PgTable)
		.where(eq(table.id, id))
		.for("update")
	if (!row) throw new NotFoundError(notFoundMessage)
	return row as InferSelectModel<T>
}

// Page size for typeahead-style lookups: never fewer than one result, never
// more than 20.
export function clampTypeahead(
	first: number | null | undefined,
	fallback: number,
): number {
	return Math.min(Math.max(first ?? fallback, 1), 20)
}
