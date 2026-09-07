import { DateTime } from "luxon"
import { Button, Column, Link, Row, Section, Text } from "react-email"
import { match, P } from "ts-pattern"
import { COLOR } from "../lib/brand-palette"
import { EmailLayout, FONT_BODY, FONT_HEADING, FONT_MONO } from "./layout"

// Every league here is US-scheduled and every kickoff time is announced in
// Eastern, so "Wednesday" means the Eastern Wednesday regardless of where the
// reader is. Formatting in UTC would move a 8:20pm ET kickoff to the next
// calendar day and tell half the list the wrong night.
const TZ = "America/New_York"

export type SeasonStartProps = {
	// "NFL" - leagues.name and leagues.abbreviation are the same string for
	// every synced league, so there is nothing to choose between.
	leagueName: string
	// ESPN's own label for the season ("2026", "2025-26"), taken verbatim the
	// way everything else that displays it does - see seasons.displayName.
	seasonDisplayName: string
	regularSeasonStartsAt: Date
	// Passed in rather than read off the clock inside, so the subject, the
	// preheader and the body can't disagree about what day it is when a render
	// straddles midnight - and so a test can pin it.
	now: Date
	// What the first slate is called in this league's own terms - "Week 1"
	// for a week-window league, "opening day" for a date-window one. The
	// caller owns this because only it knows the league's windowType.
	openingLabel: string
	// Games on that first slate, and published ballots for the season. Either
	// can be 0 - a league can open with games and no award ballots yet, or
	// with ballots synced ahead of a schedule that hasn't landed. The section
	// for a zero count is dropped rather than rendered as "0".
	gameCount: number
	ballotCount: number
	gamesUrl: string
	seasonUrl: string
	// Where the hero button points. Same two destinations as the links above,
	// but a separately built url so its utm_content can say "hero" - a click
	// breakdown that can't separate the button from the row linking the same
	// page can't tell you whether the button earns its space.
	heroUrl: string
	manageUrl: string
	unsubscribeUrl: string
	logoUrl: string
}

type Timing = Pick<
	SeasonStartProps,
	"leagueName" | "regularSeasonStartsAt" | "now"
>

// Whole calendar days apart in Eastern, not elapsed hours - "tomorrow" is a
// property of the date, so a Tuesday 11pm send about a Wednesday 1pm kickoff
// is 14 hours out and still tomorrow.
function daysUntil({ regularSeasonStartsAt, now }: Omit<Timing, "leagueName">) {
	const start = DateTime.fromJSDate(regularSeasonStartsAt)
		.setZone(TZ)
		.startOf("day")
	const today = DateTime.fromJSDate(now).setZone(TZ).startOf("day")
	return Math.round(start.diff(today, "days").days)
}

// The phrase that finishes "NFL is back ___". A weekday on its own is only
// unambiguous inside the coming week; at seven days out "Wednesday" could be
// either of two Wednesdays, so past that the date settles it. Negative days
// can't normally happen (the enqueue only fires before a season starts) but
// read as "today" rather than as a weekday in the past if one ever does.
export function kickoffPhrase(timing: Omit<Timing, "leagueName">): string {
	const days = daysUntil(timing)
	const start = DateTime.fromJSDate(timing.regularSeasonStartsAt).setZone(TZ)
	return match(days)
		.with(P.number.lte(0), () => "today")
		.with(1, () => "tomorrow")
		.with(P.number.lte(6), () => start.toFormat("cccc"))
		.otherwise(() => start.toFormat("cccc, LLL d"))
}

// Names the sport and says when, and nothing else. The whole value of this
// email is "the thing you signed up for is happening again" - a subject that
// buries that behind a clever line is a subject someone archives.
export function seasonStartSubject(timing: Timing): string {
	return `${timing.leagueName} is back ${kickoffPhrase(timing)}.`
}

// The preheader carries what's actually open, because the subject deliberately
// doesn't. Concrete counts rather than "lots to call" - a number is the part
// that reads as a real slate waiting rather than a marketing line.
export function seasonStartPreview(
	props: Pick<SeasonStartProps, "openingLabel" | "gameCount" | "ballotCount">,
): string {
	const games = `${props.gameCount} ${props.gameCount === 1 ? "game" : "games"}`
	const ballots = `${props.ballotCount} award ${props.ballotCount === 1 ? "ballot" : "ballots"}`
	return match(props)
		.with(
			{ gameCount: P.number.gt(0), ballotCount: P.number.gt(0) },
			(p) => `${games} on the ${p.openingLabel} slate, plus ${ballots}.`,
		)
		.with(
			{ gameCount: P.number.gt(0) },
			(p) => `${games} on the ${p.openingLabel} slate, waiting to be called.`,
		)
		.with({ ballotCount: P.number.gt(0) }, () => `${ballots} are open.`)
		.otherwise(() => "Get your first calls of the season in.")
}

// One CTA gets the button, and it's whichever of the two actually has
// something behind it - a hero button pointing at an empty games tab is worse
// than no button. Games win the tie because picking a winner is the shortest
// path from "I opened an email" to "I made a call"; a ballot is several picks
// deep before it's submittable.
//
// Exported because the caller has to build heroUrl for whichever destination
// this picks, and a second copy of the rule there would eventually point the
// button at one page while labelling it the other.
export function heroTarget(
	props: Pick<SeasonStartProps, "gameCount">,
): "games" | "season" {
	return props.gameCount > 0 ? "games" : "season"
}

function heroLabel(props: SeasonStartProps): string {
	return match(heroTarget(props))
		.with("games", () => `Call the ${props.openingLabel} games`)
		.with("season", () => "Open the season ballots")
		.exhaustive()
}

function ActionRow({
	eyebrow,
	title,
	body,
	linkLabel,
	href,
}: {
	eyebrow: string
	title: string
	body: string
	linkLabel: string
	href: string
}) {
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
				{eyebrow}
			</Text>
			<Row>
				<Column>
					<Link
						href={href}
						style={{
							fontFamily: FONT_BODY,
							fontSize: "14px",
							lineHeight: "20px",
							color: COLOR.ink,
							textDecoration: "none",
						}}
					>
						{title}
					</Link>
					<Text
						style={{
							fontFamily: FONT_BODY,
							fontSize: "13px",
							color: COLOR.steel,
							margin: "2px 0 0",
						}}
					>
						{body}
					</Text>
					<Text style={{ margin: "6px 0 0" }}>
						<Link
							href={href}
							style={{
								fontFamily: FONT_MONO,
								fontSize: "11px",
								letterSpacing: "0.5px",
								textTransform: "uppercase",
								color: COLOR.primaryDefault,
								textDecoration: "none",
							}}
						>
							{linkLabel} →
						</Link>
					</Text>
				</Column>
			</Row>
		</Section>
	)
}

export function SeasonStart(props: SeasonStartProps) {
	const {
		leagueName,
		seasonDisplayName,
		openingLabel,
		gameCount,
		ballotCount,
		gamesUrl,
		seasonUrl,
		heroUrl,
		manageUrl,
		unsubscribeUrl,
		logoUrl,
	} = props
	const when = kickoffPhrase(props)

	return (
		<EmailLayout
			preview={seasonStartPreview(props)}
			reason={`the ${leagueName} season is about to start`}
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
				{leagueName} {seasonDisplayName} · Kickoff
			</Text>
			<Text
				style={{
					fontFamily: FONT_HEADING,
					fontSize: "24px",
					lineHeight: "30px",
					color: COLOR.ink,
					margin: "0 0 10px",
					textAlign: "center",
				}}
			>
				Get your calls in.
			</Text>
			<Text
				style={{
					fontFamily: FONT_BODY,
					fontSize: "14px",
					lineHeight: "20px",
					color: COLOR.linen,
					margin: "0 0 20px",
					textAlign: "center",
				}}
			>
				The {leagueName} season starts {when}. Everyone's 0-0 on the season
				leaderboard. Somebody has to call it first.
			</Text>

			{gameCount > 0 && (
				<ActionRow
					eyebrow={`${leagueName} · ${openingLabel}`}
					title="Who wins?"
					body={`${gameCount} ${gameCount === 1 ? "game" : "games"} on the board. Call as many as you want, each one up until its kickoff.`}
					linkLabel="Call the games"
					href={gamesUrl}
				/>
			)}

			{ballotCount > 0 && (
				<ActionRow
					eyebrow={`${leagueName} · Season awards`}
					title="Who takes it this year?"
					body={`${ballotCount} award ${ballotCount === 1 ? "ballot" : "ballots"} open now, MVP included. They run until the season ends, but calling one today scores 3x what it will by then.`}
					linkLabel="Fill out your ballots"
					href={seasonUrl}
				/>
			)}

			<Section style={{ textAlign: "center", padding: "8px 0 0" }}>
				<Button
					href={heroUrl}
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
					{heroLabel(props)}
				</Button>
				<Text
					style={{
						fontFamily: FONT_BODY,
						fontSize: "12px",
						color: COLOR.steel,
						margin: "10px 0 0",
					}}
				>
					Every call you make is one you can hold over someone later.
				</Text>
			</Section>
		</EmailLayout>
	)
}

// What `email dev` renders this template with - a real NFL Week 1 shape
// rather than placeholder counts, so the two action rows, a long body line
// and the hero button are all on screen at once.
SeasonStart.PreviewProps = {
	leagueName: "NFL",
	seasonDisplayName: "2026",
	regularSeasonStartsAt: new Date("2026-09-09T16:00:00.000Z"),
	now: new Date("2026-09-06T13:00:00.000Z"),
	openingLabel: "Week 1",
	gameCount: 16,
	ballotCount: 6,
	gamesUrl: "https://calledmyshot.com/leagues/nfl/games",
	seasonUrl: "https://calledmyshot.com/leagues/nfl/season",
	heroUrl: "https://calledmyshot.com/leagues/nfl/games",
	manageUrl: "https://calledmyshot.com/settings",
	unsubscribeUrl: "https://calledmyshot.com/unsubscribe?token=preview",
	logoUrl: "https://calledmyshot.com/email-logo.png",
} satisfies SeasonStartProps

export default SeasonStart
