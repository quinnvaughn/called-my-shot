import { graphql } from "#/graphql/generated"

export const CreateSlateDocument = graphql(`
	mutation CreateSlate($input: CreateSlateInput!) {
		createSlate(input: $input) {
			__typename
			... on SlatePayload {
				slate {
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

export const RenameSlateDocument = graphql(`
	mutation RenameSlate($id: ID!, $name: String!) {
		renameSlate(id: $id, name: $name) {
			__typename
			... on SlatePayload {
				slate {
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

export const SetSlatePublishedDocument = graphql(`
	mutation SetSlatePublished($id: ID!, $published: Boolean!) {
		setSlatePublished(id: $id, published: $published) {
			__typename
			... on SlatePayload {
				slate {
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

export const DeleteSlateDocument = graphql(`
	mutation DeleteSlate($id: ID!) {
		deleteSlate(id: $id) {
			__typename
			... on MutationDeleteSlateSuccess {
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

export const AttachQuestionToSlateDocument = graphql(`
	mutation AttachQuestionToSlate($input: AttachQuestionToSlateInput!) {
		attachQuestionToSlate(input: $input) {
			__typename
			... on SlateQuestionPayload {
				slateQuestion {
					id
					label
					slot
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

export const RemoveQuestionFromSlateDocument = graphql(`
	mutation RemoveQuestionFromSlate($questionId: ID!) {
		removeQuestionFromSlate(questionId: $questionId) {
			__typename
			... on MutationRemoveQuestionFromSlateSuccess {
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

export const UpdateSlateQuestionDocument = graphql(`
	mutation UpdateSlateQuestion($input: UpdateSlateQuestionInput!) {
		updateSlateQuestion(input: $input) {
			__typename
			... on SlateQuestionPayload {
				slateQuestion {
					id
					label
					slot
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

export const ReorderSlateQuestionsDocument = graphql(`
	mutation ReorderSlateQuestions($slateId: ID!, $orderedQuestionIds: [ID!]!) {
		reorderSlateQuestions(
			slateId: $slateId
			orderedQuestionIds: $orderedQuestionIds
		) {
			__typename
			... on MutationReorderSlateQuestionsSuccess {
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
