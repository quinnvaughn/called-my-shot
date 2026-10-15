import type { AdminQueueSummaryQuery } from "#/graphql/generated/graphql"

export type AdminQueueSummary = Extract<
	AdminQueueSummaryQuery["adminQueueSummary"],
	{ __typename: "QueryAdminQueueSummarySuccess" }
>["data"]

export type QueueGame = NonNullable<
	AdminQueueSummary["needsResolution"][number]["game"]
>
