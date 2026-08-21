import { graphql } from "#/graphql/generated"

export const MeDocument = graphql(`
	query Me {
		me {
			id
			name
			username
			email
			isAdmin
			emailVerified
			questionCreationEnabled
		}
	}
`)
