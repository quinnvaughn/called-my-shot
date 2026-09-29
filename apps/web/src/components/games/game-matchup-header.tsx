import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Eyebrow } from "#/components/ui/eyebrow"
import { Tag } from "#/components/ui/tag"
import { TeamBadge } from "#/components/ui/team-badge"
import type { FragmentType } from "#/graphql/generated"
import type { GameStatus } from "#/graphql/generated/graphql"
import {
	formatTeamRecord,
	gameScoreLabel,
	gameStartLabel,
} from "#/lib/game-status"
import { postseasonHeading, seriesStakesLabel } from "#/lib/postseason"
import { GameStarters, type GameStartersFragment } from "./game-starters"

type TeamRecord = { wins: number; losses: number; ties: number } | null
type Team = { name: string; abbreviation: string; color: string }

type Props = {
	game: {
		status: GameStatus
		startsAt: string
		homeScore: number | null
		awayScore: number | null
		venue: string | null
		homeTeam: Team
		awayTeam: Team
		homeTeamRecord?: TeamRecord
		awayTeamRecord?: TeamRecord
		startTimeTbd?: boolean
		// Absent for a regular-season game, and wherever the query doesn't ask.
		postseason?: {
			roundLabel: string
			homeSeed: number | null
			awaySeed: number | null
			gameNumber: number | null
			ifNecessary: boolean
			summary: string | null
			clinchTeamIds: string[]
		} | null
	}
	// The same game again, as the GameStarters fragment's reference: the
	// matchup fields above are structural props, so one value can't be both.
	// Omitted where starters shouldn't show at all.
	starters?: FragmentType<typeof GameStartersFragment>
	// Starters as one key line per team with no expand toggle, for a card that
	// has to hold its height (the landing page's try-it stack).
	compactStarters?: boolean
	// Tighter padding, smaller team names, no venue - the same matchup on a
	// card that has to fit inside the landing page's fold.
	dense?: boolean
}

// maxWidth is what actually makes the ellipsis work: the name is a flex item
// in a column stack, so on the cross axis it sizes to fit-content and would
// otherwise overflow its column and collide with the score.
const nameClass = css({
	fontSize: { base: "sm", sm: "md" },
	fontWeight: "bold",
	maxWidth: "100%",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
})

const denseNameClass = css({
	fontSize: "sm",
	fontWeight: "bold",
	maxWidth: "100%",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
})

const recordClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	color: "fg.subtle",
})

// Narrow screens can't fit two full team names either side of a centered
// score, so the matchup becomes one row per team - badge and name on the
// left, that team's own score on the right - and only widens back into
// away / score / home from sm up.
const scoreboardClass = css({
	display: "grid",
	alignItems: "center",
	columnGap: "3",
	rowGap: "2.5",
	gridTemplateColumns: {
		base: "minmax(0, 1fr) auto",
		sm: "minmax(0, 1fr) auto minmax(0, 1fr)",
	},
	gridTemplateAreas: {
		base: '"away awayScore" "home homeScore"',
		sm: '"away score home"',
	},
})

// Both team lines read left-to-right on mobile; only the home line flips to
// name-then-badge once it sits on the right of a centered score.
const awayLineClass = css({
	gridArea: "away",
	justifyContent: "flex-start",
})

// flex-start at every breakpoint: row-reverse also flips the main axis, so
// from sm up "start" is the right edge and flex-start is what pins the home
// team there. flex-end would pack it left, against the score.
const homeLineClass = css({
	gridArea: "home",
	flexDirection: { base: "row", sm: "row-reverse" },
	justifyContent: "flex-start",
})

const teamScoreClass = css({
	display: { base: "block", sm: "none" },
	fontFamily: "mono",
	fontSize: "xl",
	fontWeight: "bold",
	fontVariantNumeric: "tabular-nums",
	textAlign: "right",
})

const awayScoreClass = css({ gridArea: "awayScore" })
const homeScoreClass = css({ gridArea: "homeScore" })

const matchupScoreClass = css({
	gridArea: "score",
	display: { base: "none", sm: "block" },
	fontFamily: "mono",
	fontSize: "2xl",
	fontWeight: "bold",
	textAlign: "center",
})

const versusClass = css({
	gridArea: "score",
	display: { base: "none", sm: "block" },
	fontFamily: "mono",
	fontSize: "sm",
	color: "fg.subtle",
	textAlign: "center",
})

function TeamLine({
	team,
	record,
	seed,
	home,
	dense,
}: {
	team: Team
	record: TeamRecord
	// A playoff game's seed, within the team's own league or conference.
	seed: number | null
	home: boolean
	dense: boolean
}) {
	const formattedRecord = [
		formatTeamRecord(record),
		seed ? `No. ${seed} seed` : null,
	]
		.filter(Boolean)
		.join(" · ")

	return (
		<HStack
			gap={dense ? "2" : "2.5"}
			alignItems="center"
			minWidth="0"
			className={home ? homeLineClass : awayLineClass}
		>
			<TeamBadge abbreviation={team.abbreviation} color={team.color} />
			{/* Alignment goes through the VStack prop, not a className: the
			    pattern's own alignItems="center" default otherwise wins. Away
			    reads from the left edge; home from the right once it sits on
			    the right of the score. */}
			<VStack
				gap="0"
				minWidth="0"
				alignItems={
					home ? { base: "flex-start", sm: "flex-end" } : "flex-start"
				}
			>
				<span className={dense ? denseNameClass : nameClass}>{team.name}</span>
				{formattedRecord && (
					<span className={recordClass}>{formattedRecord}</span>
				)}
			</VStack>
		</HStack>
	)
}

// The full-size matchup header for the game detail page and a game-scoped
// question's detail page - not GameBlock (components/questions/game-block.tsx),
// which stays the small inline badge inside QuestionCard/CallCard list cards.
// Detail pages are prominent enough to warrant full team names, a real score,
// and each team's record.
export function GameMatchupHeader({
	game,
	starters,
	compactStarters = false,
	dense = false,
}: Props) {
	const live = game.status === "LIVE"
	const final = game.status === "FINAL"
	const scored = live || final
	const postseason = game.postseason ?? null
	const stakes = postseason && !final ? seriesStakesLabel(postseason) : null

	return (
		<VStack
			gap={dense ? "2" : "3"}
			alignItems="stretch"
			className={css({
				border: "1px solid {colors.border.default}",
				borderRadius: "xl",
				bg: "bg.subtle",
				padding: dense ? "3" : { base: "3.5", sm: "4" },
			})}
		>
			{postseason && (
				<HStack
					justify="space-between"
					alignItems="center"
					gap="2"
					flexWrap="wrap"
				>
					<Eyebrow size="sm">
						{postseasonHeading(postseason)}
						{postseason.summary ? ` · ${postseason.summary}` : ""}
					</Eyebrow>
					{postseason.ifNecessary ? (
						<Tag size="sm">If necessary</Tag>
					) : (
						stakes && (
							<Tag variant="primary" size="sm">
								{stakes}
							</Tag>
						)
					)}
				</HStack>
			)}

			<div className={scoreboardClass}>
				<TeamLine
					team={game.awayTeam}
					record={game.awayTeamRecord ?? null}
					seed={game.postseason?.awaySeed ?? null}
					home={false}
					dense={dense}
				/>
				<TeamLine
					team={game.homeTeam}
					record={game.homeTeamRecord ?? null}
					seed={game.postseason?.homeSeed ?? null}
					home
					dense={dense}
				/>

				{scored ? (
					<>
						<span className={`${teamScoreClass} ${awayScoreClass}`}>
							{game.awayScore ?? "-"}
						</span>
						<span className={`${teamScoreClass} ${homeScoreClass}`}>
							{game.homeScore ?? "-"}
						</span>
						<span className={matchupScoreClass}>{gameScoreLabel(game)}</span>
					</>
				) : (
					<span className={versusClass}>@</span>
				)}
			</div>

			<HStack
				justify="center"
				gap="2"
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					color: "fg.muted",
					flexWrap: "wrap",
				})}
			>
				{live && (
					<HStack gap="1.5" alignItems="center">
						<span
							className={css({
								width: "1.5",
								height: "1.5",
								borderRadius: "full",
								bg: "secondary.default",
								animation: "pulse 1.6s ease-in-out infinite",
							})}
						/>
						<span
							className={css({ fontWeight: "bold", letterSpacing: "wide" })}
						>
							LIVE
						</span>
					</HStack>
				)}
				{final && <span className={css({ fontWeight: "bold" })}>FINAL</span>}
				{!live && !final && <span>{gameStartLabel(game)}</span>}
				{game.venue && !dense && (
					<>
						<span>·</span>
						<span>{game.venue}</span>
					</>
				)}
			</HStack>

			{starters && <GameStarters game={starters} compact={compactStarters} />}
		</VStack>
	)
}
