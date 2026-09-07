import { Button, Column, Link, Row, Section, Text } from "react-email"
import { match } from "ts-pattern"
import { COLOR } from "../lib/brand-palette"
import { EmailLayout, FONT_BODY, FONT_HEADING, FONT_MONO } from "./layout"

export type DigestCall = {
	questionTitle: string
	leagueAbbr: string
	shapeLabel: string
	pickLabel: string
	points: number
	isWin: boolean
	// Question page with the share panel already open - see the `share` search
	// param on the question route.
	shareUrl: string
}

// Rows listed in the body; the rest become "and N more". A 12-call Sunday
// should read as a result, not a spreadsheet. Lives here rather than in the
// drain because it is purely about how much of the list fits on screen.
const MAX_ROWS = 8

export type ResolutionDigestProps = {
	// EVERY resolved call, not just the ones that fit. The record, the net and
	// the standout are all derived from this list, and the display cap is
	// applied below - passing a pre-sliced list (as this used to) meant a
	// 12-call batch reported the record of its first 8, so the subject line
	// was simply wrong.
	calls: DigestCall[]
	// The call worth leading with - biggest swing, wins preferred.
	primaryShareUrl: string
	allCallsUrl: string
	manageUrl: string
	unsubscribeUrl: string
	logoUrl: string
}

export function digestSummary(calls: DigestCall[]) {
	const wins = calls.filter((c) => c.isWin).length
	return {
		wins,
		losses: calls.length - wins,
		net: calls.reduce((sum, c) => sum + c.points, 0),
	}
}

function signed(points: number): string {
	return `${points >= 0 ? "+" : "−"}${Math.abs(points)}`
}

// Deliberately does NOT say how they did. Answering the result in the
// subject line gives someone every reason to read it and never open - and the
// thing worth opening for (the card they can share) is inside. So the subject
// is an invitation, and the count is the only number in it: concrete, honest
// about scale, and no spoiler.
//
// Predictable on purpose. This is the same line every time apart from the
// count, so it becomes recognisable in an inbox rather than another thing to
// decode.
export function digestSubject(calls: DigestCall[]): string {
	return calls.length === 1
		? "Your call is in."
		: `Your ${calls.length} calls are in.`
}

// The standout call - same rule the drain uses to pick primaryShareUrl, so
// the preheader names the call the button will hand over. `calls` arrives
// sorted by absolute points, so the first win is the biggest one.
function standout(calls: DigestCall[]): DigestCall | undefined {
	return calls.find((c) => c.isWin) ?? calls[0]
}

// The preheader sits next to the subject in the inbox, so it can't give the
// result away either - naming the standout call without its outcome adds
// something specific and personal while leaving the answer inside.
export function digestPreview(calls: DigestCall[]): string {
	const best = standout(calls)
	if (!best) return "Your results are ready."
	return calls.length === 1
		? `${best.questionTitle} is settled.`
		: `Starting with ${best.questionTitle}.`
}

function headline(calls: DigestCall[]): string {
	const { wins, losses } = digestSummary(calls)
	return match({ total: calls.length, wins, losses })
		.with({ total: 1, wins: 1 }, () => "You called it.")
		.with({ total: 1 }, () => "That one didn't land.")
		.otherwise(() => `You went ${wins}-${losses}.`)
}

// Every call in the list carries its own share link, so the one button below
// never has to stand in for all of them. Its label says which result it acts
// on, because a single button under three of them doesn't.
//
// Deliberately avoids the word "card". That's what we call the image
// internally, but someone reading their first result email has never opened
// the share panel and has no idea what a card is - "Share this call" matches
// the button they'll actually land on (see ShareImagePanel's label), and the
// line underneath says what they get.
function primaryLabel(calls: DigestCall[]): string {
	return match({ total: calls.length, wins: digestSummary(calls).wins })
		.with({ total: 1 }, () => "Share this call")
		.with({ wins: 0 }, () => "Share your biggest miss")
		.otherwise(() => "Share your best call")
}

function CallRow({ call }: { call: DigestCall }) {
	const tone = call.isWin ? COLOR.success : COLOR.danger
	return (
		<Section
			style={{
				borderTop: `1px solid ${COLOR.border}`,
				padding: "14px 0 0",
				margin: "0 0 14px",
			}}
		>
			<Text
				style={{
					fontFamily: FONT_MONO,
					fontSize: "11px",
					letterSpacing: "0.5px",
					textTransform: "uppercase",
					color: COLOR.dim,
					margin: "0 0 4px",
				}}
			>
				{call.leagueAbbr} · {call.shapeLabel}
			</Text>
			<Row>
				<Column>
					<Link
						href={call.shareUrl}
						style={{
							fontFamily: FONT_BODY,
							fontSize: "14px",
							lineHeight: "20px",
							color: COLOR.ink,
							textDecoration: "none",
						}}
					>
						{call.questionTitle}
					</Link>
					<Text
						style={{
							fontFamily: FONT_BODY,
							fontSize: "13px",
							color: COLOR.steel,
							margin: "2px 0 0",
						}}
					>
						Your call: {call.pickLabel}
					</Text>
					<Text style={{ margin: "6px 0 0" }}>
						<Link
							href={call.shareUrl}
							style={{
								fontFamily: FONT_MONO,
								fontSize: "11px",
								letterSpacing: "0.5px",
								textTransform: "uppercase",
								color: COLOR.primaryDefault,
								textDecoration: "none",
							}}
						>
							Share this →
						</Link>
					</Text>
				</Column>
				<Column align="right" style={{ verticalAlign: "top", width: "80px" }}>
					<Text
						style={{
							fontFamily: FONT_HEADING,
							fontSize: "18px",
							color: tone,
							margin: 0,
							textAlign: "right",
						}}
					>
						{signed(call.points)}
					</Text>
				</Column>
			</Row>
		</Section>
	)
}

export function ResolutionDigest({
	calls,
	primaryShareUrl,
	allCallsUrl,
	manageUrl,
	unsubscribeUrl,
	logoUrl,
}: ResolutionDigestProps) {
	const { net } = digestSummary(calls)
	const netTone = net >= 0 ? COLOR.success : COLOR.danger
	const shown = calls.slice(0, MAX_ROWS)
	const overflowCount = Math.max(0, calls.length - shown.length)

	return (
		<EmailLayout
			preview={digestPreview(calls)}
			reason="a call of yours just resolved"
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
					textAlign: "center",
				}}
			>
				Results are in
			</Text>
			<Text
				style={{
					fontFamily: FONT_HEADING,
					fontSize: "24px",
					lineHeight: "30px",
					color: COLOR.ink,
					margin: "0 0 2px",
					textAlign: "center",
				}}
			>
				{headline(calls)}
			</Text>
			<Text
				style={{
					fontFamily: FONT_HEADING,
					fontSize: "30px",
					color: netTone,
					margin: "0 0 20px",
					textAlign: "center",
				}}
			>
				{signed(net)} pts
			</Text>

			{shown.map((call) => (
				<CallRow key={call.shareUrl} call={call} />
			))}

			{overflowCount > 0 && (
				<Text
					style={{
						fontFamily: FONT_BODY,
						fontSize: "13px",
						color: COLOR.dim,
						margin: "0 0 16px",
						textAlign: "center",
					}}
				>
					and {overflowCount} more.
				</Text>
			)}

			<Section style={{ textAlign: "center", padding: "8px 0 0" }}>
				<Button
					href={primaryShareUrl}
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
					{primaryLabel(calls)}
				</Button>
				<Text
					style={{
						fontFamily: FONT_BODY,
						fontSize: "12px",
						color: COLOR.steel,
						margin: "10px 0 0",
					}}
				>
					We'll make you an image of it you can post anywhere.
				</Text>
				<Text
					style={{
						fontFamily: FONT_BODY,
						fontSize: "13px",
						color: COLOR.dim,
						margin: "14px 0 0",
					}}
				>
					<Link href={allCallsUrl} style={{ color: COLOR.steel }}>
						See all your calls
					</Link>
				</Text>
			</Section>
		</EmailLayout>
	)
}

// What `email dev` renders this template with. Realistic on purpose - an
// empty-string preview hides exactly the layout problems (long titles
// wrapping, a negative total, a mixed win/loss column) worth catching.
ResolutionDigest.PreviewProps = {
	calls: [
		{
			questionTitle: "Patrick Mahomes over 275.5 passing yards vs. Buffalo",
			leagueAbbr: "NFL",
			shapeLabel: "Player Prop",
			pickLabel: "Over 275.5",
			points: 210,
			isWin: true,
			shareUrl: "https://calledmyshot.com/questions/1/mahomes?share=1",
		},
		{
			questionTitle: "Bills to win outright",
			leagueAbbr: "NFL",
			shapeLabel: "Game Outcome",
			pickLabel: "Buffalo Bills",
			points: 130,
			isWin: true,
			shareUrl: "https://calledmyshot.com/questions/2/bills?share=1",
		},
		{
			questionTitle: "Travis Kelce to score a touchdown",
			leagueAbbr: "NFL",
			shapeLabel: "Yes/No",
			pickLabel: "Yes",
			points: -40,
			isWin: false,
			shareUrl: "https://calledmyshot.com/questions/3/kelce?share=1",
		},
	],
	primaryShareUrl: "https://calledmyshot.com/questions/1/mahomes?share=1",
	allCallsUrl: "https://calledmyshot.com/my-calls",
	manageUrl: "https://calledmyshot.com/settings",
	unsubscribeUrl: "https://calledmyshot.com/unsubscribe?token=preview",
	logoUrl: "https://calledmyshot.com/email-logo.png",
} satisfies ResolutionDigestProps

export default ResolutionDigest
