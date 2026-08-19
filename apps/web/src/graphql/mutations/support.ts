import { graphql } from "#/graphql/generated"

export const FileSupportTicketDocument = graphql(`
	mutation FileSupportTicket($input: FileSupportTicketInput!) {
		fileSupportTicket(input: $input) {
			__typename
			... on FileSupportTicketPayload {
				id
				createdAt
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
		}
	}
`)
