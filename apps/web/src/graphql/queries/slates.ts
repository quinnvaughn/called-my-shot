import { graphql } from "#/graphql/generated"

// Backs the create-question form's "add to slate" autocomplete - a bounded
// typeahead result set scoped to the question's own league, same shape as
// GamesByLeagueDocument (queries/sports.ts).
export const AdminSlateSearchDocument = graphql(`
	query AdminSlateSearch($leagueId: ID!, $query: String, $first: Int) {
		adminSlateSearch(leagueId: $leagueId, query: $query, first: $first) {
			__typename
			... on QueryAdminSlateSearchSuccess {
				data {
					id
					name
					memberCount
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)

// Admin Slates list page.
export const AdminSlatesDocument = graphql(`
	query AdminSlates(
		$search: String
		$status: SlateStatus
		$leagueId: ID
		$sortBy: AdminSlateSort
		$sortDir: SortDirection
		$after: String
	) {
		adminSlates(
			search: $search
			status: $status
			leagueId: $leagueId
			sortBy: $sortBy
			sortDir: $sortDir
			after: $after
		) {
			__typename
			... on QueryAdminSlatesSuccess {
				data {
					items {
						id
						name
						status
						memberCount
						league {
							id
							name
							abbreviation
						}
					}
					pageInfo {
						hasNextPage
						endCursor
					}
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)

// Slate builder's "attach existing" modal - questions in the slate's own
// league that don't already belong to a slate (a question can only ever be
// in one). Reuses adminQuestions rather than a bespoke query.
export const SlateAttachableQuestionsDocument = graphql(`
	query SlateAttachableQuestions($leagueId: ID!, $search: String) {
		adminQuestions(
			leagueId: $leagueId
			unassignedToSlate: true
			search: $search
			first: 30
		) {
			__typename
			... on QueryAdminQuestionsSuccess {
				data {
					items {
						id
						title
						shape
						status
					}
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)

// Slate builder page - includes draft slates and the full unfiltered member
// list (unlike the public `slate` query, which only ever resolves once
// published). Also used to resolve a slate's display name when the
// create-question form arrives locked to one via ?slateId=.
export const AdminSlateDocument = graphql(`
	query AdminSlate($id: ID!) {
		adminSlate(id: $id) {
			__typename
			... on QueryAdminSlateSuccess {
				data {
					id
					name
					status
					publishedAt
					memberCount
					league {
						id
						name
						abbreviation
					}
					members {
						id
						label
						slot
						sortOrder
						question {
							id
							title
							shape
							status
							locksAt
						}
					}
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)
