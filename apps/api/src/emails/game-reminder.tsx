import { DateTime } from "luxon"
import { Column, Link, Row, Section, Text } from "react-email"
import { COLOR } from "../lib/brand-palette"
import { EmailLayout, FONT_BODY, FONT_HEADING, FONT_MONO } from "./layout"

// Every league here is US-scheduled and announces start times in Eastern -
// same reasoning as season-start.tsx.
const TZ = "America/New_York"

export type ReminderGame = {
	// "NYJ @ BUF" - away @ home, the order every matchup in the app reads in.
	matchup: string
	awayTeamName: string
	homeTeamName: string
	leagueAbbr: string
	startsAt: Date
	gameUrl: string
}

export type GameReminderProps = {
	// Earliest start first. Never empty - the drain only renders a batch that
	// has at least one game in it.
	games: ReminderGame[]
	manageUrl: string
	unsubscribeUrl: string
	logoUrl: string
}

export function startTimeLabel(startsAt: Date): string {
	return `${DateTime.fromJSDate(startsAt).setZone(TZ).toFormat("h:mm a")} ET`
}

// Says when, in the reader's own terms. A batch can span up to half an hour
// (see BATCH_WINDOW_MINUTES in lib/game-reminders.tsx), so games that don't
// all share a start time get a range rather than a time that is wrong for
// some of them.
export function gameReminderSubject(games: ReminderGame[]): string {
	const [first] = games
	const last = games[games.length - 1]
	if (!first || !last) return "Your game starts soon"
	if (games.length === 1) {
		return `${first.matchup} starts at ${startTimeLabel(first.startsAt)}`
	}
	const firstLabel = startTimeLabel(first.startsAt)
	const lastLabel = startTimeLabel(last.startsAt)
	return firstLabel === lastLabel
		? `${games.length} games start at ${firstLabel}`
		: `${games.length} games start between ${firstLabel} and ${lastLabel}`
}

export function gameReminderPreview(games: ReminderGame[]): string {
	return games.length === 1
		? "Check who's starting. Calls on the game lock when it starts."
		: "Check who's starting. Calls on each game lock when it starts."
}

function GameRow({ game }: { game: ReminderGame }) {
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
				{game.leagueAbbr} · {startTimeLabel(game.startsAt)}
			</Text>
			<Row>
				<Column>
					<Link
						href={game.gameUrl}
						style={{
							fontFamily: FONT_BODY,
							fontSize: "14px",
							lineHeight: "20px",
							color: COLOR.ink,
							textDecoration: "none",
						}}
					>
						{game.awayTeamName} @ {game.homeTeamName}
					</Link>
					<Text style={{ margin: "6px 0 0" }}>
						<Link
							href={game.gameUrl}
							style={{
								fontFamily: FONT_MONO,
								fontSize: "11px",
								letterSpacing: "0.5px",
								textTransform: "uppercase",
								color: COLOR.primaryDefault,
								textDecoration: "none",
							}}
						>
							Open the game →
						</Link>
					</Text>
				</Column>
			</Row>
		</Section>
	)
}

export function GameReminder({
	games,
	manageUrl,
	unsubscribeUrl,
	logoUrl,
}: GameReminderProps) {
	return (
		<EmailLayout
			preview={gameReminderPreview(games)}
			reason="you asked to be reminded before these games start"
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
				Game reminder
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
				{gameReminderSubject(games)}.
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
				Each game page lists who's starting. Calls on a game lock when it
				starts.
			</Text>

			{games.map((game) => (
				<GameRow key={game.gameUrl} game={game} />
			))}
		</EmailLayout>
	)
}

GameReminder.PreviewProps = {
	games: [
		{
			matchup: "NYJ @ BUF",
			awayTeamName: "New York Jets",
			homeTeamName: "Buffalo Bills",
			leagueAbbr: "NFL",
			startsAt: new Date("2026-09-20T17:00:00.000Z"),
			gameUrl: "https://calledmyshot.com/games/preview-1",
		},
		{
			matchup: "DAL @ PHI",
			awayTeamName: "Dallas Cowboys",
			homeTeamName: "Philadelphia Eagles",
			leagueAbbr: "NFL",
			startsAt: new Date("2026-09-20T17:00:00.000Z"),
			gameUrl: "https://calledmyshot.com/games/preview-2",
		},
	],
	manageUrl: "https://calledmyshot.com/settings",
	unsubscribeUrl: "https://calledmyshot.com/unsubscribe?token=preview",
	logoUrl: "https://calledmyshot.com/email-logo.png",
} satisfies GameReminderProps

export default GameReminder
