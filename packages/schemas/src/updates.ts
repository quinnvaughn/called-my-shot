import { z } from "zod"
import { IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES, imageKeySchema } from "./images"

export const updateInputSchema = z.object({
	title: z
		.string()
		.trim()
		.min(3, "Give it a title")
		.max(100, "Keep the title under 100 characters"),
	summary: z
		.string()
		.trim()
		.min(10, "Write a one-line summary")
		.max(200, "Keep the summary under 200 characters"),
	// Markdown.
	body: z
		.string()
		.trim()
		.min(1, "Write the post")
		.max(20000, "Keep it under 20,000 characters"),
	coverImageKey: imageKeySchema.nullish(),
})
export type UpdateInput = z.infer<typeof updateInputSchema>

// An image for a product update post. Unlike avatars and banners it isn't
// cropped to a fixed size, just scaled down and re-encoded in the browser, so
// the same type and size limits apply.
export const createUpdateImageUploadSchema = z.object({
	contentType: z.enum(IMAGE_CONTENT_TYPES, {
		message: "Images must be WebP or JPEG",
	}),
	contentLength: z
		.number()
		.int()
		.positive()
		.max(IMAGE_MAX_BYTES, "Images must be 2 MB or smaller"),
})
