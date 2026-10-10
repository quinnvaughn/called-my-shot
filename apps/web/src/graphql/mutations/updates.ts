import { graphql } from "#/graphql/generated"

export const CreateUpdateDocument = graphql(`
	mutation CreateUpdate($input: UpdateInput!) {
		createUpdate(input: $input) {
			__typename
			... on Update {
				id
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

export const EditUpdateDocument = graphql(`
	mutation EditUpdate($id: ID!, $input: UpdateInput!) {
		editUpdate(id: $id, input: $input) {
			__typename
			... on Update {
				id
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on NotFoundError {
				message
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

export const SetUpdatePublishedDocument = graphql(`
	mutation SetUpdatePublished($id: ID!, $published: Boolean!) {
		setUpdatePublished(id: $id, published: $published) {
			__typename
			... on Update {
				id
				slug
				publishedAt
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on NotFoundError {
				message
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

export const DeleteUpdateDocument = graphql(`
	mutation DeleteUpdate($id: ID!) {
		deleteUpdate(id: $id) {
			__typename
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

export const CreateUpdateImageUploadDocument = graphql(`
	mutation CreateUpdateImageUpload($input: CreateUpdateImageUploadInput!) {
		createUpdateImageUpload(input: $input) {
			__typename
			... on UpdateImageUpload {
				key
				uploadUrl
				publicUrl
				headers {
					name
					value
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

export const SendUpdateTestEmailDocument = graphql(`
	mutation SendUpdateTestEmail($id: ID!) {
		sendUpdateTestEmail(id: $id) {
			__typename
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on NotFoundError {
				message
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

export const SendUpdateEmailDocument = graphql(`
	mutation SendUpdateEmail($id: ID!) {
		sendUpdateEmail(id: $id) {
			__typename
			... on MutationSendUpdateEmailSuccess {
				data
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
			... on NotFoundError {
				message
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
