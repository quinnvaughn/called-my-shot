import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { Resvg } from "@resvg/resvg-js"
import satori from "satori"

const nodeRequire = createRequire(import.meta.url)

// satori needs raw font buffers (.ttf/.otf/.woff - notably not .woff2, which
// it can't parse), loaded once at module init rather than per-render.
function loadFont(pkg: string, file: string): Buffer {
	const pkgDir = path.dirname(nodeRequire.resolve(`${pkg}/package.json`))
	return readFileSync(path.join(pkgDir, "files", file))
}

const FONTS = [
	{
		name: "Inter",
		weight: 400 as const,
		style: "normal" as const,
		data: loadFont("@fontsource/inter", "inter-latin-400-normal.woff"),
	},
	{
		name: "Inter",
		weight: 600 as const,
		style: "normal" as const,
		data: loadFont("@fontsource/inter", "inter-latin-600-normal.woff"),
	},
	{
		name: "Space Mono",
		weight: 400 as const,
		style: "normal" as const,
		data: loadFont(
			"@fontsource/space-mono",
			"space-mono-latin-400-normal.woff",
		),
	},
	{
		name: "Space Mono",
		weight: 700 as const,
		style: "normal" as const,
		data: loadFont(
			"@fontsource/space-mono",
			"space-mono-latin-700-normal.woff",
		),
	},
	{
		name: "Archivo Black",
		weight: 400 as const,
		style: "normal" as const,
		data: loadFont(
			"@fontsource/archivo-black",
			"archivo-black-latin-400-normal.woff",
		),
	},
]

// Minimal satori element shape. satori's own types import `ReactNode` from
// `react` (react is a devDependency here purely for that type - it's never
// imported at runtime), but this package has no actual React/JSX toolchain,
// so share-card trees are built as plain objects via `el()` below instead of
// .tsx.
export type SatoriNode = {
	type: string
	props: Record<string, unknown> & { style?: Record<string, string | number> }
}

export function el(
	type: string,
	style: Record<string, string | number> = {},
	children?: SatoriNode | SatoriNode[] | string,
): SatoriNode {
	return {
		type,
		props: { style, ...(children !== undefined ? { children } : {}) },
	}
}

// satori's <img> reads src/width/height as top-level props, not style
// properties, unlike every other element `el()` builds - a separate helper
// rather than overloading `el()`'s signature for this one case.
export function image(
	src: string,
	width: number,
	height: number,
	style: Record<string, string | number> = {},
): SatoriNode {
	return { type: "img", props: { src, width, height, style } }
}

// For raw SVG primitives (svg, circle, line, path, ...) - satori supports
// these directly since it renders to SVG itself, but they take real SVG
// attributes (cx, r, stroke, ...) as props rather than a style object like
// every other element `el()` builds.
export function svgEl(
	type: string,
	props: Record<string, unknown>,
	children?: SatoriNode[],
): SatoriNode {
	return { type, props: { ...props, ...(children ? { children } : {}) } }
}

// height is optional - satori supports sizing by width alone and computing
// height from content, which is what a "card" (as opposed to a fixed-size
// poster) wants: its real height is whatever its content needs, same as the
// React version it's mirroring never hardcodes a height either.
type RenderOptions = { width: number; height?: number }

// Generalized on purpose - the caller builds the element tree (a user's
// stats card today, a call's result card later), this just turns any such
// tree into a PNG buffer. satori renders the tree to SVG, resvg rasterizes
// that SVG to a PNG.
export async function renderShareImage(
	node: SatoriNode,
	{ width, height }: RenderOptions,
): Promise<Buffer> {
	const svg = await satori(
		node as never,
		{ width, height, fonts: FONTS } as never,
	)
	const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } })
	return Buffer.from(resvg.render().asPng())
}
