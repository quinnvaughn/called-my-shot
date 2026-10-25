import sharp from "sharp"

// Synthetic photos for the portrait tests. Not a test file itself.

// A head-and-shoulders silhouette on a transparent ground: a head circle
// over a wider shoulder block, the shape a league CDN cutout has.
export async function cutoutPng(width = 260, height = 190): Promise<Buffer> {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
		<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#d9b48f"/><stop offset="1" stop-color="#5a3d2b"/>
		</linearGradient></defs>
		<circle cx="${width / 2}" cy="${height * 0.32}" r="${height * 0.2}" fill="url(#g)"/>
		<rect x="${width * 0.2}" y="${height * 0.55}" width="${width * 0.6}" height="${height * 0.45}" rx="20" fill="#2a4d8f"/>
	</svg>`
	return sharp(Buffer.from(svg)).png().toBuffer()
}

// The same figure with its background still in.
export async function opaquePng(width = 260, height = 190): Promise<Buffer> {
	return sharp(await cutoutPng(width, height))
		.flatten({ background: "#7f9fbf" })
		.png()
		.toBuffer()
}
