import { graphql } from "#/graphql/generated"

export const CreateChallengeDocument = graphql(`
	mutation CreateChallenge($input: CreateChallengeInput!) {
		createChallenge(input: $input) {
			__typename
			... on ChallengePayload {
				challenge {
					id
					code
				}
			}
			... on Error {
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

export const AcceptChallengeDocument = graphql(`
	mutation AcceptChallenge($input: AcceptChallengeInput!) {
		acceptChallenge(input: $input) {
			__typename
			... on ChallengePayload {
				challenge {
					id
					code
				}
			}
			... on Error {
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

export const PostChallengeToGroupsDocument = graphql(`
	mutation PostChallengeToGroups($input: PostChallengeToGroupsInput!) {
		postChallengeToGroups(input: $input) {
			__typename
			... on ChallengePayload {
				challenge {
					id
				}
			}
			... on Error {
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

export const SendChallengeGloatDocument = graphql(`
	mutation SendChallengeGloat($input: SendChallengeGloatInput!) {
		sendChallengeGloat(input: $input) {
			__typename
			... on GloatSentPayload {
				gloat {
					id
				}
			}
			... on Error {
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

export const ReportGloatDocument = graphql(`
	mutation ReportGloat($input: ReportGloatInput!) {
		reportGloat(input: $input) {
			__typename
			... on GloatReportPayload {
				report {
					id
				}
			}
			... on Error {
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
