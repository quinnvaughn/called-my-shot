import type { ImageKind, UserImageKind } from "@called-my-shot/schemas"
import { match } from "ts-pattern"
import { gqlFetch } from "#/graphql/fetcher"
import type {
	ImageKind as GqlImageKind,
	UserImageKind as GqlUserImageKind,
	GroupImageKind,
} from "#/graphql/generated/graphql"
import {
	CreateImageUploadDocument,
	RemoveGroupImageDocument,
	RemoveMyImageDocument,
	SetGroupImageDocument,
	SetMyImageDocument,
} from "#/graphql/images/mutations"

// Whose image is being changed. Everything else (key prefix, permissions)
// follows from this on the api side.
export type ImageTarget =
	| { kind: UserImageKind }
	| { kind: "logo" | "banner"; groupId: string }

// A failure worth showing as-is: the message is written for the person
// uploading, unlike a network or GraphQL error's.
export class ImageSaveError extends Error {}

const GENERIC_FAILURE = "Couldn't save the image. Try again."

function gqlKind(kind: ImageKind): GqlImageKind {
	return match(kind)
		.with("avatar", () => "AVATAR" as const)
		.with("user_banner", () => "USER_BANNER" as const)
		.with("logo", () => "GROUP_LOGO" as const)
		.with("banner", () => "GROUP_BANNER" as const)
		.exhaustive()
}

function userKind(kind: UserImageKind): GqlUserImageKind {
	return kind === "avatar" ? "AVATAR" : "BANNER"
}

function groupKind(kind: "logo" | "banner"): GroupImageKind {
	return kind === "logo" ? "LOGO" : "BANNER"
}

// Any non-success member of a result union. Each carries a message written
// for the person on the other end.
function failure(result: { __typename?: string; message?: string }): never {
	throw new ImageSaveError(result.message ?? GENERIC_FAILURE)
}

// Uploads a cropped image and attaches it: a presigned URL from the api, a
// PUT straight to R2, then the key handed back to be verified and saved.
export async function saveImage(target: ImageTarget, blob: Blob) {
	const { createImageUpload: upload } = await gqlFetch(
		CreateImageUploadDocument,
		{
			input: {
				kind: gqlKind(target.kind),
				groupId: "groupId" in target ? target.groupId : null,
				contentType: blob.type,
				contentLength: blob.size,
			},
		},
	)
	if (upload.__typename !== "ImageUpload") failure(upload)

	const response = await fetch(upload.uploadUrl, {
		method: "PUT",
		body: blob,
		headers: Object.fromEntries(upload.headers.map((h) => [h.name, h.value])),
	}).catch(() => null)
	if (!response?.ok) throw new ImageSaveError(GENERIC_FAILURE)

	if (!("groupId" in target)) {
		const { setMyImage } = await gqlFetch(SetMyImageDocument, {
			input: { kind: userKind(target.kind), key: upload.key },
		})
		if (setMyImage.__typename !== "User") failure(setMyImage)
		return
	}
	const { setGroupImage } = await gqlFetch(SetGroupImageDocument, {
		input: {
			groupId: target.groupId,
			kind: groupKind(target.kind),
			key: upload.key,
		},
	})
	if (setGroupImage.__typename !== "GroupPayload") failure(setGroupImage)
}

export async function removeImage(target: ImageTarget) {
	if (!("groupId" in target)) {
		const { removeMyImage } = await gqlFetch(RemoveMyImageDocument, {
			input: { kind: userKind(target.kind) },
		})
		if (removeMyImage.__typename !== "User") failure(removeMyImage)
		return
	}
	const { removeGroupImage } = await gqlFetch(RemoveGroupImageDocument, {
		input: { groupId: target.groupId, kind: groupKind(target.kind) },
	})
	if (removeGroupImage.__typename !== "GroupPayload") failure(removeGroupImage)
}
