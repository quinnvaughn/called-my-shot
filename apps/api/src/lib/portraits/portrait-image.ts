import sharp from "sharp"

// Turns a player's photo into the square head-and-shoulders portrait the
// Rushmore art shows in a ring. The photo is kept as it is, in color; this
// only finds the face and crops to it, so every portrait sits in its ring the
// same way whatever the source shot it at.
//
// A cutout (a person on a transparent background, which every league CDN
// serves) is cropped from its own alpha. A photo with its background still
// in (an old NHL mugshot, a Basketball-Reference or Wikipedia photo) has no
// alpha to read, so it's cropped square from the top, where the face is in
// any headshot.

export const PORTRAIT_SIZE = 400

// Alpha at or under this is background. Real cutouts antialias their edge,
// so anything faint is fringe rather than figure.
const SOLID = 40

// The fraction of an image that is see-through, for telling a cutout from a
// photo with its background still in. Read off a small copy, which is plenty
// for a share.
export async function transparentShare(image: Buffer): Promise<number> {
	const { data, info } = await sharp(image)
		.ensureAlpha()
		.resize(64, 64, { fit: "fill" })
		.extractChannel("alpha")
		.raw()
		.toBuffer({ resolveWithObject: true })
	let clear = 0
	for (let i = 0; i < info.width * info.height; i++) {
		if ((data[i] as number) <= SOLID) clear++
	}
	return clear / (info.width * info.height)
}

// A photo is treated as a cutout once at least this much of it is clear: a
// head-and-shoulders cutout leaves the corners and the space beside the head
// empty, which is well over this.
export const CUTOUT_SHARE = 0.12

export type Crop = { left: number; top: number; width: number; height: number }

// The square head-and-shoulders box, from the alpha mask (row-major, one byte
// per pixel). The head's own width sets the scale: the box is a fixed number
// of head widths across from just above the crown, centred on the head, so a
// tight NBA headshot and a full-length photo from 1950 both come out framed
// the same way. The box can run past the image's edges; the caller pads.
export function headAndShouldersCrop(
	alpha: Uint8Array,
	width: number,
	height: number,
): Crop | null {
	let top = -1
	let bottom = -1
	let minX = width
	let maxX = -1
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if ((alpha[y * width + x] as number) > SOLID) {
				if (top < 0) top = y
				bottom = y
				if (x < minX) minX = x
				if (x > maxX) maxX = x
			}
		}
	}
	if (top < 0) return null
	const figureHeight = bottom - top + 1
	const figureWidth = maxX - minX + 1

	// The head is whatever is solid in the top band of the figure: its median
	// row width, and the mean column for the centre.
	const band = Math.max(
		4,
		Math.round(Math.min(figureHeight, figureWidth) * 0.3),
	)
	const widths: number[] = []
	let sumX = 0
	let count = 0
	for (let y = top; y < Math.min(height, top + band); y++) {
		let left = -1
		let right = -1
		for (let x = 0; x < width; x++) {
			if ((alpha[y * width + x] as number) > SOLID) {
				if (left < 0) left = x
				right = x
				sumX += x
				count++
			}
		}
		if (left >= 0) widths.push(right - left + 1)
	}
	widths.sort((a, b) => a - b)
	const headWidth = Math.max(1, widths[Math.floor(widths.length / 2)] ?? 1)
	const centerX = count > 0 ? sumX / count : (minX + maxX) / 2

	const side = Math.round(
		Math.min(headWidth * 2.5, figureHeight * 1.04 + headWidth * 0.1),
	)
	return {
		left: Math.round(centerX - side / 2),
		top: Math.round(top - side * 0.08),
		width: side,
		height: side,
	}
}

// Cuts the box out of a cutout, padding with transparency wherever the box
// runs past an edge.
async function cropCutout(image: Buffer): Promise<Buffer | null> {
	const { data, info } = await sharp(image)
		.ensureAlpha()
		.extractChannel("alpha")
		.raw()
		.toBuffer({ resolveWithObject: true })
	const crop = headAndShouldersCrop(data, info.width, info.height)
	if (!crop) return null
	const pad = {
		left: Math.max(0, -crop.left),
		top: Math.max(0, -crop.top),
		right: Math.max(0, crop.left + crop.width - info.width),
		bottom: Math.max(0, crop.top + crop.height - info.height),
	}
	// Separate pipelines: sharp runs an extract before an extend in the same
	// one, whatever order they're called in.
	const padded = await sharp(image)
		.ensureAlpha()
		.extend({ ...pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toBuffer()
	return sharp(padded)
		.extract({
			left: crop.left + pad.left,
			top: crop.top + pad.top,
			width: crop.width,
			height: crop.height,
		})
		.png()
		.toBuffer()
}

// A photo in, a PORTRAIT_SIZE square PNG out, or null when a cutout has
// nothing solid in it.
export async function preparePortrait(
	image: Buffer,
	cutout: boolean,
): Promise<Buffer | null> {
	const cropped = cutout ? await cropCutout(image) : image
	if (!cropped) return null
	return sharp(cropped)
		.resize(PORTRAIT_SIZE, PORTRAIT_SIZE, { fit: "cover", position: "top" })
		.png({ compressionLevel: 9 })
		.toBuffer()
}
