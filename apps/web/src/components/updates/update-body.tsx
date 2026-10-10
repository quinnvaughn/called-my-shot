import { Marked } from "marked"
import { useMemo } from "react"
import { css } from "styled-system/css"

const escapeHtml = (text: string) =>
	text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")

// Raw HTML in the markdown is shown as text rather than rendered: the body is
// markdown only, the same thing the email's renderer supports, so a page that
// looks right here also looks right in the inbox.
const markdown = new Marked({
	gfm: true,
	breaks: false,
	renderer: {
		html: ({ text }) => escapeHtml(text),
	},
})

export function renderUpdateBody(body: string): string {
	return markdown.parse(body, { async: false })
}

// Exported so the admin editor's writing area looks like the published page.
export const updateBodyStyles = css({
	fontSize: "md",
	lineHeight: "relaxed",
	color: "fg.body",
	overflowWrap: "anywhere",
	"& > * + *": { marginTop: "4" },
	"& h1, & h2, & h3": {
		fontFamily: "heading",
		color: "fg.default",
		lineHeight: "tight",
		marginTop: "8",
	},
	"& h1": { fontSize: "2xl" },
	"& h2": { fontSize: "xl" },
	"& h3": { fontSize: "lg" },
	"& strong": { color: "fg.default", fontWeight: "semibold" },
	"& a": {
		color: "primary.default",
		textDecoration: "underline",
		textUnderlineOffset: "3px",
		_hover: { opacity: 0.8 },
	},
	"& ul, & ol": { paddingLeft: "6" },
	"& ul": { listStyleType: "disc" },
	"& ol": { listStyleType: "decimal" },
	"& li + li": { marginTop: "1" },
	"& img": {
		display: "block",
		maxWidth: "full",
		height: "auto",
		borderRadius: "lg",
		border: "1px solid {colors.border.default}",
	},
	"& blockquote": {
		borderLeft: "3px solid {colors.border.default}",
		paddingLeft: "4",
		color: "fg.muted",
	},
	"& hr": {
		border: "none",
		borderTop: "1px solid {colors.border.default}",
	},
	"& code": { fontFamily: "mono", fontSize: "sm", color: "fg.default" },
})

// The post body, rendered from markdown. Only admins write it.
export function UpdateBody({ body }: { body: string }) {
	const html = useMemo(() => renderUpdateBody(body), [body])
	return (
		<div
			className={updateBodyStyles}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: admin-authored markdown with raw HTML escaped above
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	)
}
