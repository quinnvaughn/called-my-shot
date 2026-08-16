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
