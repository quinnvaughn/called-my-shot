import { graphql } from "#/graphql/generated"

// Everything the presser section on a picks page draws. questions is already
// filtered to what the viewer may see (see canSeeQuestion in the api), so
// nothing here decides visibility.
export const PresserSectionFragment = graphql(`
	fragment PresserSection_presser on Presser {
		id
		isOpen
		closesAt
		viewerIsOwner
		statement
		statementPostedAt
		answeredCount
		pendingCount
		viewerAskStatus
		owner {
			id
			...Identity_user
		}
		viewerQuestion {
			id
			body
			isAnswered
		}
		questions {
			id
			source
			body
			answer
			noComment
			isAnswered
			createdAt
			asker {
				id
			...Identity_user
			}
			call {
				id
				question {
					id
					title
				}
			}
		}
	}
`)
