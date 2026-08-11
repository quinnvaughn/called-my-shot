import { graphql } from "#/graphql/generated"

export const SignUpDocument = graphql(`
	mutation SignUp($input: SignUpInput!) {
		signUp(input: $input) {
			__typename
			... on AuthPayload {
				user {
					id
					name
					username
					email
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

export const SignInDocument = graphql(`
	mutation SignIn($input: SignInInput!) {
		signIn(input: $input) {
			__typename
			... on AuthPayload {
				user {
					id
					name
					username
					email
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

export const SignOutDocument = graphql(`
	mutation SignOut {
		signOut
	}
`)
