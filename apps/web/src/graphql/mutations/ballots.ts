import { graphql } from "#/graphql/generated"

export const CreateBallotDocument = graphql(`
	mutation CreateBallot($input: CreateBallotInput!) {
		createBallot(input: $input) {
			__typename
			... on BallotPayload {
				ballot {
					id
					name
					status
					league {
						id
						name
					}
				}
			}
			... on ValidationError {
				fieldErrors {
					field
					message
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

export const RenameBallotDocument = graphql(`
	mutation RenameBallot($id: ID!, $name: String!) {
		renameBallot(id: $id, name: $name) {
			__typename
			... on BallotPayload {
				ballot {
					id
					name
				}
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const SetBallotPublishedDocument = graphql(`
	mutation SetBallotPublished($id: ID!, $published: Boolean!) {
		setBallotPublished(id: $id, published: $published) {
			__typename
			... on BallotPayload {
				ballot {
					id
					status
					publishedAt
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const DeleteBallotDocument = graphql(`
	mutation DeleteBallot($id: ID!) {
		deleteBallot(id: $id) {
			__typename
			... on MutationDeleteBallotSuccess {
				data
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

export const AttachQuestionToBallotDocument = graphql(`
	mutation AttachQuestionToBallot($input: AttachQuestionToBallotInput!) {
		attachQuestionToBallot(input: $input) {
			__typename
			... on BallotQuestionPayload {
				ballotQuestion {
					id
					label
					slot
					section
					question {
						id
						title
					}
				}
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const RemoveQuestionFromBallotDocument = graphql(`
	mutation RemoveQuestionFromBallot($questionId: ID!) {
		removeQuestionFromBallot(questionId: $questionId) {
			__typename
			... on MutationRemoveQuestionFromBallotSuccess {
				data
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

export const UpdateBallotQuestionDocument = graphql(`
	mutation UpdateBallotQuestion($input: UpdateBallotQuestionInput!) {
		updateBallotQuestion(input: $input) {
			__typename
			... on BallotQuestionPayload {
				ballotQuestion {
					id
					label
					slot
					section
				}
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

// Ordering the ballots of one league and season against each other, the same
// whole-set way ReorderBallotQuestions orders the questions inside one.
export const ReorderBallotsDocument = graphql(`
	mutation ReorderBallots(
		$leagueId: ID!
		$seasonId: ID!
		$orderedBallotIds: [ID!]!
	) {
		reorderBallots(
			leagueId: $leagueId
			seasonId: $seasonId
			orderedBallotIds: $orderedBallotIds
		) {
			__typename
			... on MutationReorderBallotsSuccess {
				data
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const ReorderBallotQuestionsDocument = graphql(`
	mutation ReorderBallotQuestions($ballotId: ID!, $orderedQuestionIds: [ID!]!) {
		reorderBallotQuestions(
			ballotId: $ballotId
			orderedQuestionIds: $orderedQuestionIds
		) {
			__typename
			... on MutationReorderBallotQuestionsSuccess {
				data
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)
