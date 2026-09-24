import { graphql } from "#/graphql/generated"

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
