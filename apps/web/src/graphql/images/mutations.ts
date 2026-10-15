import type { QueryClient } from "@tanstack/react-query"
import { match, P } from "ts-pattern"
import { graphql } from "#/graphql/generated"
import {
	SettingsPageDocument,
	UserProfileDocument,
} from "#/graphql/generated/graphql"
import { invalidateGroups } from "#/graphql/groups/mutations"
import { invalidateOperations } from "#/graphql/query-options"
import type { ImageTarget } from "#/lib/images/save-image"

// Step one of an upload: a presigned URL for a fresh key. The bytes go
// straight from the browser to R2 (see lib/images/save-image.ts).
export const CreateImageUploadDocument = graphql(`
	mutation CreateImageUpload($input: CreateImageUploadInput!) {
		createImageUpload(input: $input) {
			__typename
			... on ImageUpload {
				key
				uploadUrl
				headers {
					name
					value
				}
			}
			... on Error {
				message
			}
		}
	}
`)

// Step two: attach the uploaded key.
export const SetMyImageDocument = graphql(`
	mutation SetMyImage($input: SetMyImageInput!) {
		setMyImage(input: $input) {
			__typename
			... on User {
				id
				avatarUrl
				bannerUrl
			}
			... on Error {
				message
			}
		}
	}
`)

export const RemoveMyImageDocument = graphql(`
	mutation RemoveMyImage($input: RemoveMyImageInput!) {
		removeMyImage(input: $input) {
			__typename
			... on User {
				id
				avatarUrl
				bannerUrl
			}
			... on Error {
				message
			}
		}
	}
`)

export const SetGroupImageDocument = graphql(`
	mutation SetGroupImage($input: SetGroupImageInput!) {
		setGroupImage(input: $input) {
			__typename
			... on GroupPayload {
				group {
					id
					logoUrl
					bannerUrl
				}
			}
			... on Error {
				message
			}
		}
	}
`)

export const RemoveGroupImageDocument = graphql(`
	mutation RemoveGroupImage($input: RemoveGroupImageInput!) {
		removeGroupImage(input: $input) {
			__typename
			... on GroupPayload {
				group {
					id
					logoUrl
					bannerUrl
				}
			}
			... on Error {
				message
			}
		}
	}
`)

export function invalidateAfterImageChange(
	queryClient: QueryClient,
	target: ImageTarget,
) {
	return match(target)
		.with({ kind: P.union("logo", "banner") }, () =>
			invalidateGroups(queryClient),
		)
		.with({ kind: "user_banner" }, () =>
			invalidateOperations(queryClient, [
				SettingsPageDocument,
				UserProfileDocument,
			]),
		)
		.with({ kind: "avatar" }, () =>
			// The avatar shows beside the viewer's name on nearly every page.
			queryClient.invalidateQueries(),
		)
		.exhaustive()
}
