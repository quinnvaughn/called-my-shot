import { graphql } from "#/graphql/generated"

export const CreateQuestionDocument = graphql(`
	mutation CreateQuestion($input: CreateQuestionInput!) {
		createQuestion(input: $input) {
			__typename
			... on QuestionPayload {
				question {
					id
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
