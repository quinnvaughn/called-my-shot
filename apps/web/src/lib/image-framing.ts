import type { CSSProperties } from "react"

// League CDN images whose files frame their subject smaller than the other
// leagues' do, zoomed so a logo or face reads at the same size in the same
// box. The sync only ever stores URLs from these CDNs (see
// db/sync/league-images.ts in the API), so the URL says which framing it has.
//
// NHL logos sit on a 960x640 canvas covering about 58% of its width and 69%
// of its height, where NFL logos fill a square canvas and MLB's are cropped
// to the mark: 1.5x brings them level, and the canvas margin absorbs it.
//
// NHL headshots are square cutouts of head, shoulders and chest, the head
// starting 21% down and spanning 29% of the width, where an NBA headshot's
// wide frame loses its sides to the circle and leaves a bigger face. 1.5x
// about the head (30% down) matches them.
const FRAMINGS: { prefix: string; style: CSSProperties }[] = [
	{
		prefix: "https://assets.nhle.com/logos/",
		style: { transform: "scale(1.5)" },
	},
	{
		prefix: "https://assets.nhle.com/mugs/",
		style: { transform: "scale(1.5)", transformOrigin: "50% 30%" },
	},
]

export function imageFraming(url: string): CSSProperties | undefined {
	return FRAMINGS.find((framing) => url.startsWith(framing.prefix))?.style
}
