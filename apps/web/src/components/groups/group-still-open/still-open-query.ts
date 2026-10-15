import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

export const GroupStillOpenDocument = graphql(`
	query GroupStillOpen($groupId: ID!) {
		group(id: $groupId) {
			id
			stillOpenQuestions {
				question {
					id
				}
				...StillOpenRow_entry
			}
		}
	}
`)

// Re-read every minute while anything's listed, so a question drops off once
// it locks and the counts move as members call. An empty list has nothing to
// keep current.
export const groupStillOpenQuery = (groupId: string) =>
	gqlQueryOptions(
		GroupStillOpenDocument,
		{ groupId },
		{
			refetchInterval: (query) =>
				(query.state.data?.group?.stillOpenQuestions.length ?? 0) > 0
					? 60_000
					: false,
		},
	)
