import { cva } from "styled-system/css"

// The trailing-arrow link that ends most detail pages. One accent-colored
// link per screen is the whole point of the variants: a page that offers two
// or three onward paths (a call page has the question, the streak, and the
// OS share sheet) paints every one of them in the brand orange and so ranks
// none of them. `primary` marks the single path the page most wants taken;
// everything else clickable uses `quiet`, which stays legible as a link
// through the underline rather than through color.
export const arrowLink = cva({
	base: {
		alignSelf: "flex-start",
		fontFamily: "mono",
		fontSize: "2xs",
		letterSpacing: "wide",
		textTransform: "uppercase",
		cursor: "pointer",
		textUnderlineOffset: "3px",
	},
	variants: {
		tone: {
			primary: {
				color: "primary.default",
				textDecoration: "none",
				_hover: { opacity: 0.8 },
			},
			quiet: {
				color: "fg.muted",
				textDecoration: "underline",
				_hover: { color: "fg.default" },
			},
		},
	},
	defaultVariants: { tone: "primary" },
})
