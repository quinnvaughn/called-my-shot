import { gqlFetch } from "#/graphql/fetcher"
import { CreateUpdateImageUploadDocument } from "#/graphql/mutations/updates"
import { cropToBlob, loadImage } from "./crop-to-blob"
import { ImageSaveError } from "./save-image"

// Wide enough for a full-width screenshot on a retina screen at the post's
// column width, and small enough to stay under the 2 MB upload limit.
const MAX_WIDTH = 1600

// Scales an image for a product update post down to MAX_WIDTH (never up) and
// re-encodes it, then uploads it straight to R2. No crop: screenshots keep
// their own shape. Returns the key (for a cover image) and the url it's
// served at (for the body's markdown).
export async function uploadUpdateImage(
	file: File,
): Promise<{ key: string; url: string }> {
	const src = URL.createObjectURL(file)
	let blob: Blob
	try {
		const image = await loadImage(src)
		const scale = Math.min(1, MAX_WIDTH / image.naturalWidth)
		blob = await cropToBlob(
			src,
			{
				x: 0,
				y: 0,
				width: image.naturalWidth,
				height: image.naturalHeight,
			},
			{
				width: Math.round(image.naturalWidth * scale),
				height: Math.round(image.naturalHeight * scale),
			},
		)
	} catch {
		throw new ImageSaveError("That file couldn't be read as an image.")
	} finally {
		URL.revokeObjectURL(src)
	}

	const { createUpdateImageUpload: upload } = await gqlFetch(
		CreateUpdateImageUploadDocument,
		{ input: { contentType: blob.type, contentLength: blob.size } },
	)
	if (upload.__typename !== "UpdateImageUpload") {
		throw new ImageSaveError(
			upload.__typename === "ValidationError"
				? (upload.fieldErrors[0]?.message ?? "Couldn't upload the image.")
				: upload.message,
		)
	}
	if (!upload.publicUrl) {
		throw new ImageSaveError("Image uploads aren't available right now.")
	}

	const response = await fetch(upload.uploadUrl, {
		method: "PUT",
		body: blob,
		headers: Object.fromEntries(upload.headers.map((h) => [h.name, h.value])),
	}).catch(() => null)
	if (!response?.ok) {
		throw new ImageSaveError("Couldn't upload the image. Try again.")
	}
	return { key: upload.key, url: upload.publicUrl }
}
