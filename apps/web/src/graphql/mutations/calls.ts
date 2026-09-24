import { graphql } from "#/graphql/generated"

export const CastCallDocument = graphql(`
	mutation CastCall($input: CastCallInput!) {
		castCall(input: $input) {
			__typename
			... on CastCallPayload {
				call {
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

export const RedoCallDocument = graphql(`
	mutation RedoCall($input: RedoCallInput!) {
		redoCall(input: $input) {
			__typename
			... on RedoCallPayload {
				redoBalance
				call {
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
