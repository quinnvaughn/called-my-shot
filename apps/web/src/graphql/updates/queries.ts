import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// /updates: published product updates, newest first.
export const UpdatesDocument = graphql(`
	query Updates {
		updates {
			id
			slug
			title
			summary
			coverImageUrl
			publishedAt
		}
	}
`)

export const UpdateDocument = graphql(`
	query Update($slug: String!) {
		update(slug: $slug) {
			id
			slug
			title
			summary
			body
			coverImageUrl
			publishedAt
		}
	}
`)

export const updatesQuery = gqlQueryOptions(UpdatesDocument, {})

export const updateQuery = (slug: string) =>
	gqlQueryOptions(UpdateDocument, { slug })

export const AdminUpdatesDocument = graphql(`
	query AdminUpdates {
		adminUpdates {
			__typename
			... on QueryAdminUpdatesSuccess {
				data {
					id
					slug
					title
					summary
					publishedAt
					emailedAt
					createdAt
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

export const adminUpdatesQuery = gqlQueryOptions(AdminUpdatesDocument, {})

export const AdminUpdateDocument = graphql(`
	query AdminUpdate($id: ID!) {
		adminUpdate(id: $id) {
			__typename
			... on QueryAdminUpdateSuccess {
				data {
					id
					slug
					title
					summary
					body
					coverImageKey
					coverImageUrl
					publishedAt
					emailedAt
					emailProgress {
						sent
						skipped
						pending
					}
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

export const adminUpdateQuery = (id: string) =>
	gqlQueryOptions(AdminUpdateDocument, { id })
