import { Link } from "@tanstack/react-router"
import { FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { TeamBadge } from "#/components/ui/team-badge"
import type { FragmentType } from "#/graphql/generated"
import type { GameStatus } from "#/graphql/generated/graphql"
import {
	formatTeamRecord,
	gameScoreLabel,
	gameStartLabel,
} from "#/lib/game-status"
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
	}
	// The same game again, as the GameStarters fragment's reference: the
	// matchup fields above are structural props, so one value can't be both.
	// Omitted where starters shouldn't show at all.
	starters?: FragmentType<typeof GameStartersFragment>
	// Starters as one key line per team with no expand toggle, for a card that
	// has to hold its height (the landing page's try-it stack).
	compactStarters?: boolean
	// The game page's own header leaves this off - that page already lists the
	// questions this would link to.
	questionsLink?: {
		params: { gameId: string; slug: string }
		count: number
	}
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

const awayTextClass = css({ alignItems: "flex-start" })
const homeTextClass = css({
	alignItems: { base: "flex-start", sm: "flex-end" },
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

// Sections below the matchup are separated by a rule rather than their own
// card, so the whole thing reads as one object: this game.
const sectionLinkClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "2",
	borderTop: "1px solid {colors.border.default}",
	paddingTop: "3",
	fontSize: "sm",
	color: "fg.body",
	textDecoration: "none",
	_hover: { color: "fg.default", textDecoration: "underline" },
})

function TeamLine({
	team,
	record,
	home,
}: {
	team: Team
	record: TeamRecord
	home: boolean
}) {
	const formattedRecord = formatTeamRecord(record)

	return (
		<HStack
			gap="2.5"
			alignItems="center"
			minWidth="0"
			className={home ? homeLineClass : awayLineClass}
		>
			<TeamBadge abbreviation={team.abbreviation} color={team.color} />
			<VStack
				gap="0"
				minWidth="0"
				className={home ? homeTextClass : awayTextClass}
			>
				<span className={nameClass}>{team.name}</span>
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
	questionsLink,
}: Props) {
	const live = game.status === "LIVE"
	const final = game.status === "FINAL"
	const scored = live || final

	return (
		<VStack
			gap="3"
			alignItems="stretch"
			className={css({
				border: "1px solid {colors.border.default}",
				borderRadius: "xl",
				bg: "bg.subtle",
				padding: { base: "3.5", sm: "4" },
			})}
		>
			<div className={scoreboardClass}>
				<TeamLine
					team={game.awayTeam}
					record={game.awayTeamRecord ?? null}
					home={false}
				/>
				<TeamLine
					team={game.homeTeam}
					record={game.homeTeamRecord ?? null}
					home
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
								bg: "success.default",
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
				{game.venue && (
					<>
						<span>·</span>
						<span>{game.venue}</span>
					</>
				)}
			</HStack>

			{starters && <GameStarters game={starters} compact={compactStarters} />}

			{/* Only worth a link when there's more than the question being read
			right now. */}
			{questionsLink && questionsLink.count > 1 && (
				<Link
					to="/games/$gameId/{-$slug}"
					params={questionsLink.params}
					className={sectionLinkClass}
				>
					<span>{questionsLink.count} questions on this game</span>
					<FiChevronRight size={14} />
				</Link>
			)}
		</VStack>
	)
}
