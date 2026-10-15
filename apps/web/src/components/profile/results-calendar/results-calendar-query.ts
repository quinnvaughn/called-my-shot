import { gqlQueryOptions } from "#/graphql/query-options"
import { UserRecordCalendarDocument } from "#/graphql/user/profile/queries"

export const recordCalendarQuery = (
	username: string,
	league: string | null,
	weeks: number,
	page: number,
) =>
	gqlQueryOptions(UserRecordCalendarDocument, {
		username,
		league,
		weeks,
		page,
	})
