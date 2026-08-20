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

export const ResolveQuestionDocument = graphql(`
	mutation ResolveQuestion($input: ResolveQuestionInput!) {
		resolveQuestion(input: $input) {
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
			... on NotFoundError {
				message
			}
		}
	}
`)

export const FileDisputeDocument = graphql(`
	mutation FileDispute($input: FileDisputeInput!) {
		fileDispute(input: $input) {
			__typename
			... on FileDisputePayload {
				dispute {
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
			... on NotFoundError {
				message
			}
		}
	}
`)

export const ReportQuestionDocument = graphql(`
	mutation ReportQuestion($input: ReportQuestionInput!) {
		reportQuestion(input: $input) {
			__typename
			... on ReportQuestionPayload {
				report {
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
			... on NotFoundError {
				message
			}
		}
	}
`)
