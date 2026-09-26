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

export const AttachFadeDocument = graphql(`
	mutation AttachFade($input: AttachFadeInput!) {
		attachFade(input: $input) {
			__typename
			... on AttachFadePayload {
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

export const GloatDocument = graphql(`
	mutation Gloat($input: GloatInput!) {
		gloat(input: $input) {
			__typename
			... on GloatPayload {
				fades {
					id
					gloat
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
