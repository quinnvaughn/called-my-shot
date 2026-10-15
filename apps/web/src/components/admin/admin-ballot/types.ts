import type { AdminBallotQuery } from "#/graphql/generated/graphql"

export type AdminBallot = Extract<
	NonNullable<AdminBallotQuery["adminBallot"]>,
	{ __typename: "QueryAdminBallotSuccess" }
>["data"]
