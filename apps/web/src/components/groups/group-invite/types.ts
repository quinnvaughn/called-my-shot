import type { GroupPreviewQuery } from "#/graphql/generated/graphql"

export type GroupPreview = NonNullable<GroupPreviewQuery["groupPreview"]>
export type GroupPreviewLeader = GroupPreview["leaders"][number]
