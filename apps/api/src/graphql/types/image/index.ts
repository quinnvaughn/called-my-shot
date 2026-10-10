import {
	createImageUploadSchema,
	type GroupImageKind,
	isUserImageKind,
	removeGroupImageSchema,
	removeMyImageSchema,
	setGroupImageSchema,
	setMyImageSchema,
	type UserImageKind,
} from "@called-my-shot/schemas"
import { eq } from "drizzle-orm"
import { db } from "../../../db"
import { groups, users } from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { requireGroupAdmin } from "../../../lib/groups"
import {
	type ImageOwner,
	newImageKey,
	verifyUploadedImage,
} from "../../../lib/images"
import {
	deleteImage,
	isStorageConfigured,
	type PresignedUpload,
	presignImagePut,
} from "../../../lib/storage"
import { builder } from "../../builder"
import { lockOrThrow, parseInput } from "../../helpers"
import { GroupPayload } from "../group"
import { UserRef } from "../user"

// Uploading is two steps because the bytes go straight to R2 (see
// lib/storage.ts): createImageUpload hands out a presigned PUT for a fresh
// key, and the set* mutations attach that key once the browser has uploaded
// to it. Nothing changes on a user or group until the second step.

const ImageKindEnum = builder.enumType("ImageKind", {
	values: {
		AVATAR: { value: "avatar" },
		USER_BANNER: { value: "user_banner" },
		GROUP_LOGO: { value: "logo" },
		GROUP_BANNER: { value: "banner" },
	},
})

const UserImageKindEnum = builder.enumType("UserImageKind", {
	values: {
		AVATAR: { value: "avatar" },
		BANNER: { value: "user_banner" },
	},
})

const GroupImageKindEnum = builder.enumType("GroupImageKind", {
	values: {
		LOGO: { value: "logo" },
		BANNER: { value: "banner" },
	},
})

export const UploadHeaderRef = builder
	.objectRef<{ name: string; value: string }>("UploadHeader")
	.implement({
		fields: (t) => ({
			name: t.exposeString("name"),
			value: t.exposeString("value"),
		}),
	})

const ImageUploadRef = builder
	.objectRef<PresignedUpload & { key: string }>("ImageUpload")
	.implement({
		fields: (t) => ({
			// What to hand back to setMyImage / setGroupImage once uploaded.
			key: t.exposeString("key"),
			uploadUrl: t.exposeString("url"),
			// Send these with the PUT exactly as given; they're signed.
			headers: t.field({
				type: [UploadHeaderRef],
				resolve: (upload) => upload.headers,
			}),
		}),
	})

const CreateImageUploadInput = builder.inputType("CreateImageUploadInput", {
	fields: (t) => ({
		kind: t.field({ type: ImageKindEnum, required: true }),
		// Required for group kinds, ignored for the viewer's own.
		groupId: t.id({ required: false }),
		contentType: t.string({ required: true }),
		// Bytes. Signed into the URL, so the upload must be exactly this size.
		contentLength: t.int({ required: true }),
	}),
})

const SetMyImageInput = builder.inputType("SetMyImageInput", {
	fields: (t) => ({
		kind: t.field({ type: UserImageKindEnum, required: true }),
		key: t.string({ required: true }),
	}),
})

const RemoveMyImageInput = builder.inputType("RemoveMyImageInput", {
	fields: (t) => ({
		kind: t.field({ type: UserImageKindEnum, required: true }),
	}),
})

const SetGroupImageInput = builder.inputType("SetGroupImageInput", {
	fields: (t) => ({
		groupId: t.id({ required: true }),
		kind: t.field({ type: GroupImageKindEnum, required: true }),
		key: t.string({ required: true }),
	}),
})

const RemoveGroupImageInput = builder.inputType("RemoveGroupImageInput", {
	fields: (t) => ({
		groupId: t.id({ required: true }),
		kind: t.field({ type: GroupImageKindEnum, required: true }),
	}),
})

const GROUP_IMAGE_COLUMN = {
	logo: "logoKey",
	banner: "bannerKey",
} as const satisfies Record<GroupImageKind, keyof typeof groups.$inferSelect>

// Points a group's logo or banner at a new key (or none), then drops the
// object it replaced. The row is locked so two admins saving at once can't
// both read the same old key and leave one upload orphaned.
async function replaceGroupImage(
	groupId: string,
	kind: GroupImageKind,
	key: string | null,
) {
	const column = GROUP_IMAGE_COLUMN[kind]
	const { group, previousKey } = await db.transaction(async (tx) => {
		const current = await lockOrThrow(tx, groups, groupId, "Group not found")
		const [updated] = await tx
			.update(groups)
			.set({ [column]: key })
			.where(eq(groups.id, groupId))
			.returning()
		if (!updated) throw new NotFoundError("Group not found")
		return { group: updated, previousKey: current[column] }
	})
	if (previousKey !== key) await deleteImage(previousKey)
	return { group }
}

const USER_IMAGE_COLUMN = {
	avatar: "avatarKey",
	user_banner: "bannerKey",
} as const satisfies Record<UserImageKind, keyof typeof users.$inferSelect>

// The viewer's own avatar or banner, same shape as replaceGroupImage.
async function replaceUserImage(
	userId: string,
	kind: UserImageKind,
	key: string | null,
) {
	const column = USER_IMAGE_COLUMN[kind]
	const { user, previousKey } = await db.transaction(async (tx) => {
		const current = await lockOrThrow(tx, users, userId, "User not found")
		const [updated] = await tx
			.update(users)
			.set({ [column]: key })
			.where(eq(users.id, userId))
			.returning()
		if (!updated) throw new NotFoundError("User not found")
		return { user: updated, previousKey: current[column] }
	})
	if (previousKey !== key) await deleteImage(previousKey)
	return user
}

builder.mutationFields((t) => ({
	createImageUpload: t.field({
		type: ImageUploadRef,
		errors: {
			types: [AuthenticationError, AuthorizationError],
			directResult: true,
			union: { name: "CreateImageUploadResult" },
		},
		args: { input: t.arg({ type: CreateImageUploadInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(createImageUploadSchema, args.input)

			let owner: ImageOwner
			if (isUserImageKind(input.kind)) {
				owner = { kind: input.kind, userId: user.id }
			} else {
				// the schema's refine guarantees a groupId for group kinds
				const groupId = input.groupId as string
				await requireGroupAdmin(groupId, user.id)
				owner = { kind: input.kind, groupId }
			}

			if (!isStorageConfigured()) {
				throw ValidationError.field(
					null,
					"Image uploads aren't available right now.",
				)
			}
			const key = newImageKey(owner, input.contentType)
			const upload = await presignImagePut(
				key,
				input.contentType,
				input.contentLength,
			)
			return { key, ...upload }
		},
	}),

	setMyImage: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "SetMyImageResult" },
		},
		args: { input: t.arg({ type: SetMyImageInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const { kind, key } = parseInput(setMyImageSchema, args.input)
			await verifyUploadedImage({ kind, userId: user.id }, key)
			return replaceUserImage(user.id, kind, key)
		},
	}),

	removeMyImage: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "RemoveMyImageResult" },
		},
		args: { input: t.arg({ type: RemoveMyImageInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const { kind } = parseInput(removeMyImageSchema, args.input)
			return replaceUserImage(user.id, kind, null)
		},
	}),

	setGroupImage: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "SetGroupImageResult" },
		},
		args: { input: t.arg({ type: SetGroupImageInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(setGroupImageSchema, args.input)
			await requireGroupAdmin(input.groupId, user.id)
			await verifyUploadedImage(
				{ kind: input.kind, groupId: input.groupId },
				input.key,
			)
			return replaceGroupImage(input.groupId, input.kind, input.key)
		},
	}),

	removeGroupImage: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "RemoveGroupImageResult" },
		},
		args: { input: t.arg({ type: RemoveGroupImageInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(removeGroupImageSchema, args.input)
			await requireGroupAdmin(input.groupId, user.id)
			return replaceGroupImage(input.groupId, input.kind, null)
		},
	}),
}))
