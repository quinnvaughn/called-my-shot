import type { RecordBookQuery } from "#/graphql/generated/graphql"

type Book = NonNullable<RecordBookQuery["group"]>["recordBook"]
export type Week = Book["weeks"][number]
