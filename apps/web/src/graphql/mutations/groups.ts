import { graphql } from "#/graphql/generated"

export const CreateGroupDocument = graphql(`
	mutation CreateGroup($input: CreateGroupInput!) {
		createGroup(input: $input) {
			__typename
			... on GroupPayload {
				group {
					id
					name
					memberCount
				}
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

export const JoinGroupByCodeDocument = graphql(`
	mutation JoinGroupByCode($input: JoinGroupInput!) {
		joinGroupByCode(input: $input) {
			__typename
			... on GroupPayload {
				group {
					id
					name
					memberCount
				}
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
