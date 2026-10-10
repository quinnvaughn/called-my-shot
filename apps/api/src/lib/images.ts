import { randomUUID } from "node:crypto"
import {
	type GroupImageKind,
	IMAGE_CONTENT_TYPES,
	IMAGE_MAX_BYTES,
	type ImageContentType,
	type UserImageKind,
} from "@called-my-shot/schemas"
import { ValidationError } from "./errors"
import { headImage } from "./storage"

// Who an image belongs to. The key prefix is derived from it, so the only
// keys someone can attach are ones under a prefix they're allowed to write.
// "update" is any image in a product update post (the cover or one in the
// body), all under one prefix since only admins can upload them.
export type ImageOwner =
	| { kind: UserImageKind; userId: string }
	| { kind: GroupImageKind; groupId: string }
	| { kind: "update" }

function keyPrefix(owner: ImageOwner): string {
	if (owner.kind === "update") return "updates/"
	if ("userId" in owner) {
		return owner.kind === "avatar"
			? `avatars/${owner.userId}/`
			: `users/${owner.userId}/banner/`
	}
	return `groups/${owner.groupId}/${owner.kind}/`
}

const EXTENSIONS: Record<ImageContentType, string> = {
	"image/webp": "webp",
	"image/jpeg": "jpg",
}

// A fresh key per upload, never reused, so a replaced image gets a new URL and
// nothing downstream has to be told the old one is stale.
export function newImageKey(
	owner: ImageOwner,
	contentType: ImageContentType,
): string {
	return `${keyPrefix(owner)}${randomUUID()}.${EXTENSIONS[contentType]}`
}

const UUID_FILE = /^[0-9a-f-]{36}\.(webp|jpg)$/

// The client says "I uploaded this key"; this checks it's a key newImageKey
// could have issued for this owner and that the object really is in the
// bucket, the right type, and within the limit. Throws the ValidationError
// the image mutations already declare.
export async function verifyUploadedImage(
	owner: ImageOwner,
	key: string,
): Promise<void> {
	const prefix = keyPrefix(owner)
	if (!key.startsWith(prefix) || !UUID_FILE.test(key.slice(prefix.length))) {
		throw ValidationError.field("key", "That upload isn't yours to use.")
	}
	const stored = await headImage(key)
	if (!stored) {
		throw ValidationError.field("key", "The upload didn't finish. Try again.")
	}
	if (
		!IMAGE_CONTENT_TYPES.includes(stored.contentType as ImageContentType) ||
		stored.contentLength > IMAGE_MAX_BYTES
	) {
		throw ValidationError.field("key", "That file isn't a usable image.")
	}
}
