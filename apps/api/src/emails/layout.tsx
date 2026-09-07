import type { ReactNode } from "react"
import {
	Body,
	Container,
	Head,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Text,
} from "react-email"
import { COLOR } from "../lib/brand-palette"

// Every color is stated outright on the element that needs it, never left to
// inherit. A dark email that only paints its <body> gets the background from
// one client and the default black-on-white text from another, which reads as
// black text on a near-black card.
//
// The brand fonts (Archivo Black, Space Mono) are named first and then fall
// back to stacks that actually exist on a mail client's machine - webfonts
// are stripped almost everywhere, so these are a nice-to-have on Apple Mail
// and the fallback is what most people see.
export const FONT_BODY =
	"Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
export const FONT_HEADING =
	"'Archivo Black', 'Arial Black', Helvetica, Arial, sans-serif"
export const FONT_MONO =
	"'Space Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

type Props = {
	// Shows in the inbox list next to the subject. Worth writing deliberately:
	// with no <Preview>, clients scrape the first text in the body instead,
	// which here would be the wordmark.
	preview: string
	children: ReactNode
	// Both are absolute urls built by lib/email-unsubscribe.ts.
	manageUrl: string
	unsubscribeUrl: string
	// Absolute url to the wordmark PNG in apps/web/public. A raster because
	// mail clients strip inline SVG - see scripts/render-email-logo.ts, which
	// generates it from the same builder the share cards use.
	logoUrl: string
}

export function EmailLayout({
	preview,
	children,
	manageUrl,
	unsubscribeUrl,
	logoUrl,
}: Props) {
	return (
		<Html lang="en">
			<Head />
			<Preview>{preview}</Preview>
			<Body
				style={{
					backgroundColor: COLOR.paper,
					color: COLOR.ink,
					fontFamily: FONT_BODY,
					margin: 0,
					padding: "24px 0",
				}}
			>
				<Container
					style={{
						backgroundColor: COLOR.card,
						border: `1px solid ${COLOR.border}`,
						borderRadius: "16px",
						maxWidth: "520px",
						margin: "0 auto",
						padding: "24px",
					}}
				>
					<Img
						src={logoUrl}
						alt="Called My Shot"
						width="260"
						height="34"
						style={{ display: "block", margin: "0 auto 20px" }}
					/>
					{children}
				</Container>

				<Section
					style={{ maxWidth: "520px", margin: "0 auto", padding: "0 24px" }}
				>
					<Hr
						style={{
							border: "none",
							borderTop: `1px solid ${COLOR.border}`,
							margin: "24px 0 12px",
						}}
					/>
					<Text
						style={{
							fontFamily: FONT_BODY,
							fontSize: "12px",
							lineHeight: "18px",
							color: COLOR.dim,
							margin: 0,
							textAlign: "center",
						}}
					>
						You're getting this because you have a Called My Shot account and a
						call of yours just resolved.
						<br />
						<Link href={manageUrl} style={{ color: COLOR.steel }}>
							Manage email settings
						</Link>
						{" · "}
						<Link href={unsubscribeUrl} style={{ color: COLOR.steel }}>
							Unsubscribe
						</Link>
					</Text>
				</Section>
			</Body>
		</Html>
	)
}
