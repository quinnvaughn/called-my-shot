import { Button, Img, Markdown, Section, Text } from "react-email"
import { COLOR } from "../lib/brand-palette"
import { EmailLayout, FONT_BODY, FONT_HEADING, FONT_MONO } from "./layout"

export type ProductUpdateProps = {
	title: string
	summary: string
	// Markdown, with any site-relative links already made absolute - see
	// absolutizeLinks.
	body: string
	coverImageUrl: string | null
	updateUrl: string
	manageUrl: string
	unsubscribeUrl: string
	logoUrl: string
}

// The body is written for the site, where "/groups" is a working link. In an
// email it has to carry the origin.
export function absolutizeLinks(markdown: string, origin: string): string {
	return markdown.replace(/\]\(\/(?!\/)/g, `](${origin}/`)
}

// Every element styled outright, for the reason layout.tsx gives: the email is
// dark, and anything left to the client's defaults comes out black on black.
const BODY_STYLES = {
	p: {
		fontFamily: FONT_BODY,
		fontSize: "15px",
		lineHeight: "23px",
		color: COLOR.linen,
		margin: "0 0 14px",
	},
	h1: {
		fontFamily: FONT_HEADING,
		fontSize: "20px",
		lineHeight: "26px",
		color: COLOR.ink,
		margin: "22px 0 8px",
	},
	h2: {
		fontFamily: FONT_HEADING,
		fontSize: "18px",
		lineHeight: "24px",
		color: COLOR.ink,
		margin: "20px 0 8px",
	},
	h3: {
		fontFamily: FONT_HEADING,
		fontSize: "16px",
		lineHeight: "22px",
		color: COLOR.ink,
		margin: "18px 0 6px",
	},
	li: {
		fontFamily: FONT_BODY,
		fontSize: "15px",
		lineHeight: "23px",
		color: COLOR.linen,
		margin: "0 0 4px",
	},
	ul: { margin: "0 0 14px", paddingLeft: "20px", color: COLOR.linen },
	ol: { margin: "0 0 14px", paddingLeft: "20px", color: COLOR.linen },
	bold: { color: COLOR.ink, fontWeight: 700 },
	italic: { color: COLOR.linen },
	link: { color: COLOR.primaryDefault, textDecoration: "underline" },
	image: {
		display: "block",
		maxWidth: "100%",
		height: "auto",
		borderRadius: "8px",
		margin: "6px 0 16px",
	},
	blockQuote: {
		borderLeft: `3px solid ${COLOR.border}`,
		margin: "0 0 14px",
		padding: "0 0 0 12px",
		color: COLOR.steel,
	},
	hr: {
		border: "none",
		borderTop: `1px solid ${COLOR.border}`,
		margin: "20px 0",
	},
	codeInline: {
		fontFamily: FONT_MONO,
		fontSize: "13px",
		color: COLOR.ink,
	},
}

export function ProductUpdate(props: ProductUpdateProps) {
	const {
		title,
		summary,
		body,
		coverImageUrl,
		updateUrl,
		manageUrl,
		unsubscribeUrl,
		logoUrl,
	} = props

	return (
		<EmailLayout
			preview={summary}
			reason="product updates are on in your email settings"
			manageUrl={manageUrl}
			unsubscribeUrl={unsubscribeUrl}
			logoUrl={logoUrl}
		>
			<Text
				style={{
					fontFamily: FONT_MONO,
					fontSize: "11px",
					letterSpacing: "0.5px",
					textTransform: "uppercase",
					color: COLOR.primaryDefault,
					margin: "0 0 6px",
				}}
			>
				New on Called My Shot
			</Text>
			<Text
				style={{
					fontFamily: FONT_HEADING,
					fontSize: "24px",
					lineHeight: "30px",
					color: COLOR.ink,
					margin: "0 0 16px",
				}}
			>
				{title}
			</Text>
			{coverImageUrl && (
				<Img
					src={coverImageUrl}
					alt=""
					width="472"
					style={{
						display: "block",
						width: "100%",
						maxWidth: "472px",
						height: "auto",
						borderRadius: "10px",
						margin: "0 0 18px",
					}}
				/>
			)}
			<Markdown markdownCustomStyles={BODY_STYLES}>{body}</Markdown>
			<Section style={{ textAlign: "center", padding: "10px 0 0" }}>
				<Button
					href={updateUrl}
					style={{
						backgroundColor: COLOR.primaryDefault,
						color: COLOR.paper,
						fontFamily: FONT_BODY,
						fontSize: "14px",
						fontWeight: 600,
						borderRadius: "8px",
						padding: "12px 24px",
						textDecoration: "none",
					}}
				>
					Read it on the site
				</Button>
			</Section>
		</EmailLayout>
	)
}

ProductUpdate.PreviewProps = {
	title: "Face the press after your games",
	summary: "When a game you called ends, you get a few questions about it.",
	body: "When a game you made calls on goes final, a presser opens for you.\n\n## How it works\n\n- Answer the questions about your calls\n- Your answers show on your profile\n\nFind them on [your home page](https://calledmyshot.com/home).",
	coverImageUrl: null,
	updateUrl: "https://calledmyshot.com/updates/face-the-press",
	manageUrl: "https://calledmyshot.com/settings",
	unsubscribeUrl: "https://calledmyshot.com/unsubscribe?token=preview",
	logoUrl: "https://calledmyshot.com/email-logo.png",
} satisfies ProductUpdateProps

export default ProductUpdate
