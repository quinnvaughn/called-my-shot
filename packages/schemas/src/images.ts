import { z } from "zod"

// The browser crops and re-encodes every image before it uploads (so nothing
// with EXIF or an arbitrary format reaches the bucket), and these are the only
// two encodings it produces: WebP where the browser can encode it, JPEG where
// it can't.
export const IMAGE_CONTENT_TYPES = ["image/webp", "image/jpeg"] as const
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number]

// Comfortably above what a 1500x500 WebP at the crop's quality comes out at,
// so hitting it means something skipped the crop step.
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024

export const IMAGE_KINDS = ["avatar", "user_banner", "logo", "banner"] as const
export type ImageKind = (typeof IMAGE_KINDS)[number]

export const USER_IMAGE_KINDS = ["avatar", "user_banner"] as const
export type UserImageKind = (typeof USER_IMAGE_KINDS)[number]

export const GROUP_IMAGE_KINDS = ["logo", "banner"] as const
export type GroupImageKind = (typeof GROUP_IMAGE_KINDS)[number]

// What the crop step renders each kind at. Avatars and logos are square and
// drawn at 2x their largest on-screen size; banners (a user's or a group's)
// are 3:1, the same as X's, since most photos are far closer to square and
// anything wider crops away most of their height.
export const IMAGE_DIMENSIONS: Record<
	ImageKind,
	{ width: number; height: number }
> = {
	avatar: { width: 512, height: 512 },
	user_banner: { width: 1500, height: 500 },
	logo: { width: 512, height: 512 },
	banner: { width: 1500, height: 500 },
}

export function isUserImageKind(kind: ImageKind): kind is UserImageKind {
	return (USER_IMAGE_KINDS as readonly ImageKind[]).includes(kind)
}

export const createImageUploadSchema = z
	.object({
		kind: z.enum(IMAGE_KINDS),
		groupId: z.string().uuid().nullish(),
		contentType: z.enum(IMAGE_CONTENT_TYPES, {
			message: "Images must be WebP or JPEG",
		}),
		contentLength: z
			.number()
			.int()
			.positive()
			.max(IMAGE_MAX_BYTES, "Images must be 2 MB or smaller"),
	})
	.refine((input) => isUserImageKind(input.kind) || !!input.groupId, {
		message: "Pick a group for this image",
		path: ["groupId"],
	})
export type CreateImageUploadInput = z.infer<typeof createImageUploadSchema>

export const imageKeySchema = z.string().min(1).max(200)

export const setMyImageSchema = z.object({
	kind: z.enum(USER_IMAGE_KINDS),
	key: imageKeySchema,
})

export const removeMyImageSchema = z.object({
	kind: z.enum(USER_IMAGE_KINDS),
})

export const setGroupImageSchema = z.object({
	groupId: z.string().uuid(),
	kind: z.enum(GROUP_IMAGE_KINDS),
	key: imageKeySchema,
})

export const removeGroupImageSchema = z.object({
	groupId: z.string().uuid(),
	kind: z.enum(GROUP_IMAGE_KINDS),
})
