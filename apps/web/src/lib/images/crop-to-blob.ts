// The area of the source image to keep, in the source's own pixels (what
// react-easy-crop reports as croppedAreaPixels).
export type PixelCrop = {
	x: number
	y: number
	width: number
	height: number
}

export function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error("image failed to load"))
		image.src = src
	})
}

function toBlob(
	canvas: HTMLCanvasElement,
	type: string,
	quality: number,
): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

// Draws the kept area at a fixed output size and re-encodes it. Re-encoding
// through a canvas is also what strips EXIF (GPS included) from phone photos,
// so nothing but pixels ever reaches the bucket.
//
// WebP where the browser can encode it. Browsers that can't hand back a PNG
// instead of failing, which is how the fallback to JPEG is detected.
export async function cropToBlob(
	src: string,
	crop: PixelCrop,
	size: { width: number; height: number },
): Promise<Blob> {
	const image = await loadImage(src)
	const canvas = document.createElement("canvas")
	canvas.width = size.width
	canvas.height = size.height
	const context = canvas.getContext("2d")
	if (!context) throw new Error("canvas 2d context unavailable")
	context.imageSmoothingQuality = "high"
	context.drawImage(
		image,
		crop.x,
		crop.y,
		crop.width,
		crop.height,
		0,
		0,
		size.width,
		size.height,
	)

	const webp = await toBlob(canvas, "image/webp", 0.85)
	if (webp?.type === "image/webp") return webp

	// JPEG has no alpha, and a transparent pixel encodes as black. Flattened
	// onto white instead, which is what a transparent logo was drawn against.
	const flat = document.createElement("canvas")
	flat.width = size.width
	flat.height = size.height
	const flatContext = flat.getContext("2d")
	if (!flatContext) throw new Error("canvas 2d context unavailable")
	flatContext.fillStyle = "#ffffff"
	flatContext.fillRect(0, 0, size.width, size.height)
	flatContext.drawImage(canvas, 0, 0)
	const jpeg = await toBlob(flat, "image/jpeg", 0.85)
	if (!jpeg) throw new Error("canvas could not encode the image")
	return jpeg
}
