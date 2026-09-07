import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { COLOR } from "../src/lib/brand-palette"
import { renderShareImage } from "../src/lib/share-image"
import { brandWordmark } from "../src/lib/share-cards/brand-wordmark"
import { el } from "../src/lib/share-image"

// Renders the wordmark once to a static PNG for the resolution email.
//
// An image rather than markup because mail clients strip inline SVG (Gmail
// drops it entirely), and a text approximation can't produce the crosshair
// that stands in for the O. Rendered through satori rather than converting
// assets/logo.svg with resvg for the reason brand-wordmark.ts documents: that
// SVG's embedded @font-face silently fails to load there.
//
// Committed to apps/web/public rather than generated at request time - it
// never changes between deploys, and an email <img> pointing at a static file
// is one less thing that can be slow or down when a mail client fetches it.
//
// Run with: pnpm --filter api email:logo
const REFERENCE_WIDTH = 260
const SCALE = 3 // retina; the email displays it at REFERENCE_WIDTH css px
const px = (n: number) => `${Math.round(n * SCALE)}px`

const node = el(
	"div",
	{
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		// Matches the email container's surface so the PNG has no visible
		// edge against it. Not transparent: several clients composite a
		// transparent PNG onto white, which would put cream text on white.
		backgroundColor: COLOR.card,
		width: `${REFERENCE_WIDTH * SCALE}px`,
		padding: px(6),
	},
	[brandWordmark(px, SCALE)],
)

const png = await renderShareImage(node, { width: REFERENCE_WIDTH * SCALE })
const out = fileURLToPath(
	new URL("../../web/public/email-logo.png", import.meta.url),
)
writeFileSync(out, png)
console.log(`wrote ${out} (${png.length} bytes)`)
