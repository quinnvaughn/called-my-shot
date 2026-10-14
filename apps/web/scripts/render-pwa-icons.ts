import { fileURLToPath } from "node:url"
import sharp from "sharp"

// The two icons the web app manifest needs beyond the ones already in
// public/, both rendered from android-chrome-512x512.png. Committed rather
// than generated at build time - they only change when the mark does.
//
// - android-chrome-192x192.png: the same transparent mark, smaller.
// - maskable-512x512.png: Android crops a maskable icon to whatever shape the
//   launcher uses (circle, squircle), keeping only a centered circle 80% of
//   the width. The mark runs to the edges of its own canvas, so here it sits
//   inside that circle on the app's canvas color instead of being cropped.
//
// Run with: pnpm --filter web exec tsx scripts/render-pwa-icons.ts
const BACKGROUND = "#0B0B0C"
const publicDir = (name: string) =>
	fileURLToPath(new URL(`../public/${name}`, import.meta.url))
const source = publicDir("android-chrome-512x512.png")

await sharp(source)
	.resize(192, 192)
	.png()
	.toFile(publicDir("android-chrome-192x192.png"))

const MASKABLE_SIZE = 512
const MARK_SIZE = 340
const mark = await sharp(source).resize(MARK_SIZE, MARK_SIZE).toBuffer()
await sharp({
	create: {
		width: MASKABLE_SIZE,
		height: MASKABLE_SIZE,
		channels: 4,
		background: BACKGROUND,
	},
})
	.composite([{ input: mark, gravity: "center" }])
	.png()
	.toFile(publicDir("maskable-512x512.png"))
