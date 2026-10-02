import { Fragment, useState } from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type {
	StatContextCard_StatContextFragment,
	StatContextCard_TrackRecordFragment,
} from "#/graphql/generated/graphql"
import { formatRecord as formatWinLoss, formatSignedPoints } from "#/lib/ballot-entry"

export const StatContextTrackRecordFragment = graphql(`
	fragment StatContextCard_trackRecord on TrackRecord {
		label
		rows {
			label
			sides {
				label
				wins
				losses
				netPoints
			}
		}
	}
`)

export const StatContextCardFragment = graphql(`
	fragment StatContextCard_statContext on StatContext {
		statLabel
		lastN
		ranking {
			playerId
			label
			mean
			games
			opponentTeamId
			isHome
		}
		defenses {
			teamId
			games
			meanAllowed
		}
		subjects {
			label
			recentGames {
				gameId
				date
				opponentTeamId
				isHome
				value
				didNotPlay
			}
			seasonToDate {
				games
				mean
				overLine
			}
			home {
				games
				mean
			}
			away {
				games
				mean
			}
			rest {
				medianRestDays
				shortRest {
					games
					mean
				}
				longRest {
					games
					mean
				}
			}
			opponentAllowed {
				teamId
				games
				meanAllowed
				positions
			}
			teamShare {
				sharePct
				games
			}
			usage {
				label
				games
				perGame
				sharePct
			}
		}
		matchup {
			focus
			sides {
				label
				teamId
				isHome
				differential {
					kind
					value
					games
				}
				overall {
					games
					pointsForPerGame
					pointsAgainstPerGame
					overLine
				}
				inThisRole {
					games
					wins
					losses
					ties
					otLosses
				}
				headToHead {
					games
					wins
					losses
					ties
					otLosses
				}
				lastTen {
					games
					wins
					losses
					ties
					otLosses
				}
				streak {
					outcome
					length
				}
				restDays
				recentResults {
					gameId
					date
					opponentAbbreviation
					isHome
					pointsFor
					pointsAgainst
					outcome
				}
			}
			meetings {
				gameId
				date
				homeTeamId
				awayTeamId
				homeScore
				awayScore
			}
		}
	}
`)

type Subject = StatContextCard_StatContextFragment["subjects"][number]
type Matchup = NonNullable<StatContextCard_StatContextFragment["matchup"]>
type MatchupSide = Matchup["sides"][number]

// Thresholds are deliberately low. A bar set where a sport's own early season
// can't reach it blanks the card exactly when the little that exists is most
// wanted: in week 2 of an NFL season nobody has three games.
//
// The game strip needs two games to be a strip rather than a restatement of
// the headline.
const MIN_LOG = 2
// "1 of 1" is not a rate. Two is, so that's the floor - the same point every
// other figure here starts averaging at.
const MIN_HIT_RATE = 2
// A split needs two games on each side, or it's just two games relabelled.
const MIN_PER_SIDE = 2
// A record needs two games to be a record rather than a restatement of one
// result - and the strip below already shows that one, with its score on it.
const MIN_RECORD = 2
// "W1" is the last result wearing a different hat. Two is the shortest run
// worth calling a streak.
const MIN_STREAK = 2
// How many results the matchup strip shows, against the ten the server sends.
// Ten of these are wider than a player's game log - each carries a score and an
// opponent, not one number - so ten wrapped to four rows and buried the figures
// under them. The last ten is still on the card, as a record in a tile.
const MATCHUP_RESULTS = 5

type TeamLabels = Record<string, string>

const mutedClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	color: "fg.subtle",
	whiteSpace: "nowrap",
})

const numberClass = css({
	fontFamily: "mono",
	fontSize: "sm",
	fontVariantNumeric: "tabular-nums",
})

const tileValueClass = css({
	fontFamily: "heading",
	fontSize: "lg",
	lineHeight: "1.1",
})

const denseTileValueClass = css({
	fontFamily: "heading",
	fontSize: "sm",
	lineHeight: "1.1",
})

const tileLabelClass = css({
	fontFamily: "mono",
	fontSize: "3xs",
	letterSpacing: "wide",
	color: "fg.subtle",
	textTransform: "uppercase",
})

const sectionHeadingClass = css({
	fontFamily: "mono",
	fontSize: "xs",
	letterSpacing: "wide",
	color: "fg.muted",
	textTransform: "uppercase",
})

// A fixed section name so the card is recognisable page to page, with the stat
// as a qualifier on it. The stat appears exactly once, which is what lets every
// label below stay a short inherited qualifier.
function sectionTitle(statLabel: string): string {
	return statLabel ? `The stats \u00b7 ${statLabel}` : "The stats"
}

function round(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

// Position codes are written plural when they name a group of players: "WR"
// becomes "WRs". Codes already ending in S ("SS") are left alone.
function plural(position: string): string {
	return position.endsWith("S") ? position : `${position}s`
}

function shortDate(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		month: "numeric",
		day: "numeric",
	})
}

// The number this whole card is about, and the qualifier on it. The stat
// itself is NOT named here - the card's heading says it once, and every label
// under it inherits it. That's what lets these stay short while staying
// generic: "last game" works for receiving yards, hits and rebounds alike,
// where anything self-sufficient would have to name the stat every time.
type Headline = { value: string; label: string }

function headline(subject: Subject): Headline | null {
	const played = subject.recentGames.filter(
		(g) => !g.didNotPlay && g.value !== null,
	)
	if (played.length === 0) return null

	if (played.length === 1) {
		return { value: round(played[0]?.value ?? 0), label: "last game" }
	}
	const mean =
		played.reduce((sum, g) => sum + (g.value ?? 0), 0) / played.length
	return {
		value: round(mean),
		label: `per game, last ${played.length}`,
	}
}

// A horizontal strip rather than a row per game: five numbers side by side
// are scannable, five table rows are a wall.
function GameStrip({
	subject,
	teams,
}: {
	subject: Subject
	teams: TeamLabels
}) {
	if (subject.recentGames.length < MIN_LOG) return null

	return (
		<HStack gap="4" flexWrap="wrap">
			{[...subject.recentGames].reverse().map((game) => {
				const opponent = teams[game.opponentTeamId]
				return (
					<VStack key={game.gameId} gap="0.5" alignItems="flex-start">
						<span className={numberClass}>
							{game.didNotPlay || game.value === null
								? "--"
								: round(game.value)}
						</span>
						<span className={mutedClass}>
							{shortDate(game.date)}
							{opponent ? ` ${game.isHome ? "vs" : "@"} ${opponent}` : ""}
						</span>
					</VStack>
				)
			})}
		</HStack>
	)
}

// A number and what it is, never a sentence. The stat is never named again -
// the headline above already said what these are measured in, and repeating
// "receiving yards" in every row is most of what made the first version
// unreadable.
//
// A thin sample is shown rather than hidden. Only a figure that is genuinely
// meaningless at low n is withheld: a hit rate of 1 of 1 isn't a rate, and a
// home/away split with one game a side is two games relabelled, which the
// strip above already shows.
type Tile = { value: string; label: string }

function supportingTiles(subject: Subject, teams: TeamLabels): Tile[] {
	const tiles: Tile[] = []

	const season = subject.seasonToDate
	if (season && season.games >= MIN_HIT_RATE && season.overLine !== null) {
		tiles.push({
			value: `${season.overLine} of ${season.games}`,
			label: "cleared the line",
		})
	}

	// Ahead of the splits below, and the share ahead of the count, because the
	// compact card keeps only the first two tiles. Volume is the steadiest
	// thing on this card: yards move week to week and the targets or carries
	// behind them mostly don't, so a share of the team's is the figure most
	// likely to still hold on Sunday.
	//
	// Two tiles rather than one because they answer different objections. The
	// count is volume whoever else is on the field; the share is volume that
	// survives a game script. Both name the column they are counted in, since
	// neither is the stat the headline is measured in.
	const usage = subject.usage
	if (usage) {
		tiles.push({
			value: `${round(usage.sharePct)}%`,
			label:
				usage.games === 1
					? `of team ${usage.label}, last game`
					: `of team ${usage.label}`,
		})
		tiles.push({
			value: round(usage.perGame),
			label:
				usage.games === 1
					? `${usage.label}, last game`
					: `${usage.label} per game`,
		})
	}

	if (
		subject.home &&
		subject.away &&
		subject.home.games >= MIN_PER_SIDE &&
		subject.away.games >= MIN_PER_SIDE
	) {
		tiles.push({
			value: `${round(subject.home.mean)} / ${round(subject.away.mean)}`,
			label: "home / away",
		})
	}

	const rest = subject.rest
	if (
		rest?.shortRest &&
		rest.longRest &&
		rest.shortRest.games >= MIN_PER_SIDE &&
		rest.longRest.games >= MIN_PER_SIDE
	) {
		tiles.push({
			value: `${round(rest.longRest.mean)} / ${round(rest.shortRest.mean)}`,
			label: `${round(rest.medianRestDays)}+ days rest / less`,
		})
	}

	const share = subject.teamShare
	if (share) {
		tiles.push({
			value: `${round(share.sharePct)}%`,
			label: share.games === 1 ? "of team total, last game" : "of team total",
		})
	}

	const allowed = subject.opponentAllowed
	if (allowed) {
		// Past tense, which agrees with any subject - the earlier "ATL allow"
		// was only broken because the present tense has to agree with a team
		// name. The opposing team IS named here even though the matchup
		// header shows it, because without it the number reads as something
		// the subject's own team gave up. The span is spelled out for the
		// same reason: 124 over one game and 124 a game are different claims.
		const who = teams[allowed.teamId] ?? "opponent"
		const positions = allowed.positions.map(plural).join("/")
		const to = positions ? ` to ${positions}` : ""
		tiles.push({
			value: round(allowed.meanAllowed),
			label:
				allowed.games === 1
					? `${who} allowed${to}, last game`
					: `${who} allowed${to}, per game`,
		})
	}

	return tiles
}

// A pool question's answer is who is in front, so the list is the card. Rank
// on the left, name, then what they average - the number stays right-aligned
// and in the same face as every other figure here so the column scans.
//
// The sample is spelled out per row rather than printed as a bare count: one
// game reads "last game", which is honest about the ordering being a single
// week rather than dressing it up as an average. Early in a season that is
// what every row will say, and saying it is better than implying a season's
// worth of evidence behind the sort.
function Ranking({
	ranking,
	defenses,
	teams,
}: {
	ranking: StatContextCard_StatContextFragment["ranking"]
	defenses: StatContextCard_StatContextFragment["defenses"]
	teams: TeamLabels
}) {
	return (
		<VStack gap="3" alignItems="stretch">
			<VStack gap="1.5" alignItems="stretch">
				{ranking.map((player, index) => {
					// Named on the row because it is not the same down the list:
					// half the pool is facing one of these defenses and half the
					// other, and the tiles below say what each gives up.
					const opponent = player.opponentTeamId
						? teams[player.opponentTeamId]
						: undefined
					return (
						<HStack key={player.playerId} justify="space-between" gap="3">
							<HStack gap="2" minWidth="0">
								<span className={mutedClass}>{index + 1}</span>
								<span
									className={css({
										fontSize: "sm",
										minWidth: "0",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									})}
								>
									{player.label}
								</span>
								{opponent && (
									<span className={cx(mutedClass, css({ flexShrink: "0" }))}>
										{player.isHome ? "vs" : "@"} {opponent}
									</span>
								)}
							</HStack>
							<HStack gap="2" flexShrink="0">
								<span className={numberClass}>{round(player.mean)}</span>
								<span className={mutedClass}>
									{player.games === 1 ? "last game" : `${player.games} games`}
								</span>
							</HStack>
						</HStack>
					)
				})}
			</VStack>
			<TileGrid tiles={defenseTiles(defenses, teams)} dense={false} />
		</VStack>
	)
}

// What each side of the game gives up in the pooled stat. Two tiles rather
// than a column on the list: the number belongs to the defense, not to the
// player, and repeating it down five rows would say the same thing twice
// while burying which of the two is the softer spot.
function defenseTiles(
	defenses: StatContextCard_StatContextFragment["defenses"],
	teams: TeamLabels,
): Tile[] {
	return defenses.map((defense) => ({
		value: round(defense.meanAllowed),
		label:
			defense.games === 1
				? `${teams[defense.teamId] ?? "opponent"} allowed, last game`
				: `${teams[defense.teamId] ?? "opponent"} allowed, per game`,
	}))
}

// Value large in the heading face over a mono micro-label, the same hierarchy
// the profile stat tiles use. Shared by both column renderers.
function HeadlineBlock({
	lead,
	dense,
}: {
	lead: Headline | null
	dense: boolean
}) {
	if (!lead) return null

	return (
		<VStack gap="0.5" alignItems="flex-start">
			<span
				className={css({
					fontFamily: "heading",
					fontSize: dense ? "lg" : "3xl",
					lineHeight: "1",
				})}
			>
				{lead.value}
			</span>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "3xs",
					letterSpacing: "wide",
					color: "fg.subtle",
					textTransform: "uppercase",
				})}
			>
				{lead.label}
			</span>
		</VStack>
	)
}

// Shared by both column renderers so a matchup's tiles and a stat line's can't
// drift into two different grids.
function TileGrid({ tiles, dense }: { tiles: Tile[]; dense: boolean }) {
	if (tiles.length === 0) return null

	return (
		<Grid
			gridTemplateColumns={{
				base: "repeat(2, minmax(0, 1fr))",
				sm: "repeat(auto-fit, minmax(7rem, 1fr))",
			}}
			gap={dense ? "2" : "2.5"}
		>
			{tiles.map((tile) => (
				<VStack key={tile.label} gap="0.5" alignItems="flex-start">
					<span className={dense ? denseTileValueClass : tileValueClass}>
						{tile.value}
					</span>
					<span className={tileLabelClass}>{tile.label}</span>
				</VStack>
			))}
		</Grid>
	)
}

function SubjectColumn({
	subject,
	teams,
	maxTiles,
	dense = false,
}: {
	subject: Subject
	teams: TeamLabels
	// Left off where there's room for every tile the recipe produced.
	maxTiles?: number
	// A whole type scale down, for the landing card.
	dense?: boolean
}) {
	const lead = headline(subject)
	const tiles = supportingTiles(subject, teams).slice(0, maxTiles)
	if (!lead && tiles.length === 0) return null

	return (
		<VStack gap={dense ? "2" : "3"} alignItems="stretch" minWidth="0">
			{/* Always named, not just in a head-to-head. On a one-sided card
			    the subject was only implied by the question title further up
			    the page, which leaves a bare "75 / LAST GAME" sitting next to
			    a tile that names a different team entirely. */}
			{subject.label && <Eyebrow size="sm">{subject.label}</Eyebrow>}
			<HeadlineBlock lead={lead} dense={dense} />
			<GameStrip subject={subject} teams={teams} />
			<TileGrid tiles={tiles} dense={dense} />
		</VStack>
	)
}

const OUTCOME_LETTER = { WIN: "W", LOSS: "L", TIE: "T" } as const

// The four scoring-gap metrics, by the name each sport actually uses. The
// server decides which one a league gets (lib/stat-context/differential.ts);
// this is only how it is written and formatted, and the two halves have to
// stay in step - a net rating is a rate to one decimal, where a season total
// is a whole number and wears its sign.
const DIFFERENTIAL_LABEL = {
	NET_RATING: "net rating",
	RUN_DIFFERENTIAL: "run differential",
	POINT_DIFFERENTIAL: "point differential",
	GOAL_DIFFERENTIAL: "goal differential",
} as const

// Ties are only written when there are any - a 6-3-0 is how nobody records an
// NBA season. The NHL's overtime losses are written whenever ESPN's split
// supplies them, zero included, the way hockey records always read.
function formatRecord(record: {
	wins: number
	losses: number
	ties: number
	otLosses?: number | null
}): string {
	const base = `${record.wins}-${record.losses}`
	if (record.otLosses != null) return `${base}-${record.otLosses}`
	return record.ties > 0 ? `${base}-${record.ties}` : base
}

// The sign is the whole point of a differential, so a positive one keeps its
// plus.
function signed(value: number): string {
	return value > 0 ? `+${round(value)}` : round(value)
}

// A season total is counted in whole runs or points, never 80.5 of them.
function signedWhole(value: number): string {
	const whole = Math.round(value)
	return whole > 0 ? `+${whole}` : String(whole)
}

function games(count: number): string {
	return count === 1 ? "1 game" : `${count} games`
}

// What this side is about, and what it is measured over.
//
// Never the won-lost record: the matchup header sits directly above this card
// and already prints it, so leading with it spends the biggest number here on
// something the viewer read a moment ago. Margin is the number that isn't up
// there, and it separates two teams better than their records do - a 9-7 at
// +6 a game and a 9-7 at -1 are not the same team.
function matchupHeadline(
	side: MatchupSide,
	focus: Matchup["focus"],
): Headline | null {
	const overall = side.overall
	// An average over one game is that game, which the strip below already
	// shows, with its actual score on it rather than a mean of one.
	if (!overall || overall.games < MIN_RECORD) return null

	if (focus === "SCORING") {
		return {
			value: round(overall.pointsForPerGame + overall.pointsAgainstPerGame),
			label: `combined per game, ${games(overall.games)}`,
		}
	}

	// No standings reading from before this question locked, so there is no
	// differential to lead with. The results strip below still stands on its own.
	const differential = side.differential
	if (!differential) return null
	return {
		// A rate reads to a decimal; a season total is whole and keeps its sign,
		// which is the part that says which way it ran.
		value:
			differential.kind === "NET_RATING"
				? signed(differential.value)
				: signedWhole(differential.value),
		label: `${DIFFERENTIAL_LABEL[differential.kind]}, ${games(differential.games)}`,
	}
}

function matchupTiles(side: MatchupSide, focus: Matchup["focus"]): Tile[] {
	const tiles: Tile[] = []
	const overall = side.overall
	if (!overall) return tiles

	// The same margin, narrowed to the side of the scoreboard this team is on
	// in this game. Not both splits for both teams - what the visitor does at
	// home says nothing about a road game.
	// A record here rather than another differential: the headline above is
	// already the scoring gap, and what the team has actually done in this role
	// is a different fact rather than the same one sliced again. Not a repeat of
	// the matchup header either, which carries the overall record only.
	const role = side.inThisRole
	if (role && role.games >= MIN_PER_SIDE) {
		tiles.push({
			value: formatRecord(role),
			label: side.isHome ? "at home" : "on the road",
		})
	}

	// The summary the strip below no longer carries, now that it shows five.
	if (side.lastTen) {
		tiles.push({ value: formatRecord(side.lastTen), label: "last 10" })
	}

	if (
		focus === "SCORING" &&
		overall.overLine !== null &&
		overall.games >= MIN_HIT_RATE
	) {
		tiles.push({
			value: `${overall.overLine} of ${overall.games}`,
			label: "cleared the total",
		})
	}

	// Margin is the headline for a who-wins question, so it isn't repeated
	// here. What it's made of is what these two numbers add.
	if (overall.games >= MIN_RECORD) {
		tiles.push({
			value: `${round(overall.pointsForPerGame)} / ${round(overall.pointsAgainstPerGame)}`,
			label: "scored / allowed",
		})
	}

	const streak = side.streak
	if (streak && streak.length >= MIN_STREAK) {
		tiles.push({
			value: `${OUTCOME_LETTER[streak.outcome]}${streak.length}`,
			label: "current streak",
		})
	}

	if (side.restDays !== null) {
		tiles.push({
			value: String(side.restDays),
			label: side.restDays === 1 ? "day of rest" : "days of rest",
		})
	}

	return tiles
}

// The team's own results, in the same strip GameStrip uses for a stat line.
// The opponent comes off the row rather than a lookup: a team's schedule runs
// through teams this game has nothing to do with.
//
// One result is enough here, where a stat line needs MIN_LOG. That threshold
// is there because a one-game strip restates the headline above it, and this
// card's headline gates out at exactly that point - so in the case where the
// strip stands alone, it is the only thing left that says anything.
function ResultStrip({ results }: { results: MatchupSide["recentResults"] }) {
	const shown = results.slice(0, MATCHUP_RESULTS)
	if (shown.length === 0) return null

	return (
		<VStack gap="1.5" alignItems="stretch">
			{/* Said outright, because the figures above are measured over the
			    whole season and these are not - without it the strip reads as
			    the season's games, and a team that has played 150 of them
			    appears to have played five. Counted from what is actually
			    shown, so a side with three games says three. */}
			<span className={tileLabelClass}>
				{shown.length === 1 ? "last game" : `last ${shown.length}`}
			</span>
			<HStack gap="4" flexWrap="wrap">
				{[...shown].reverse().map((result) => (
					<VStack key={result.gameId} gap="0.5" alignItems="flex-start">
						<span className={numberClass}>
							{`${OUTCOME_LETTER[result.outcome]} ${result.pointsFor}-${result.pointsAgainst}`}
						</span>
						<span className={mutedClass}>
							{`${shortDate(result.date)} ${result.isHome ? "vs" : "@"} ${result.opponentAbbreviation}`}
						</span>
					</VStack>
				))}
			</HStack>
		</VStack>
	)
}

function MatchupColumn({
	side,
	focus,
	maxTiles,
	dense = false,
}: {
	side: MatchupSide
	focus: Matchup["focus"]
	maxTiles?: number
	dense?: boolean
}) {
	const lead = matchupHeadline(side, focus)
	const tiles = matchupTiles(side, focus).slice(0, maxTiles)

	return (
		<VStack gap={dense ? "2" : "3"} alignItems="stretch" minWidth="0">
			{/* Figures first, results last. The strip is the one block whose
			    height varies with the data, so keeping it at the bottom leaves
			    the two columns' tiles on the same line as each other instead of
			    sliding out of step whenever one side has wrapped to more rows
			    than the other. */}
			{side.label && <Eyebrow size="sm">{side.label}</Eyebrow>}
			<HeadlineBlock lead={lead} dense={dense} />
			<TileGrid tiles={tiles} dense={dense} />
			<ResultStrip results={side.recentResults} />
		</VStack>
	)
}

// Who won a given meeting is left to its two scores. A "SEA won" tag beside
// them is the kind of restatement every label on this card avoids.
//
// The series as a whole is a different matter: "HOU 2-9 SEA" sat in the same
// face and the same right-hand column as the scores below it and read as one
// more of them. Said in words it cannot - "leads" is what makes it a record
// rather than a scoreline.
function seriesSummary(
	series: NonNullable<MatchupSide["headToHead"]>,
	first: MatchupSide,
	second: MatchupSide,
	teams: TeamLabels,
): string {
	const drawn = series.ties > 0 ? `-${series.ties}` : ""
	if (series.wins === series.losses) {
		return `series tied ${series.wins}-${series.losses}${drawn}`
	}
	const ahead = series.wins > series.losses ? first : second
	const high = Math.max(series.wins, series.losses)
	const low = Math.min(series.wins, series.losses)
	return `${teams[ahead.teamId] ?? ""} leads ${high}-${low}${drawn}`
}

function Meetings({
	matchup,
	teams,
}: {
	matchup: Matchup
	teams: TeamLabels
}) {
	const meetings = matchup.meetings
	if (meetings.length === 0) return null

	const [first, second] = matchup.sides
	const series = first?.headToHead
	// The list is capped, so where it shows fewer than they have played it has
	// to say so - otherwise a 9-2 series reads as five games that don't add up.
	const total = series?.games ?? meetings.length
	const summary = [
		series && first && second
			? seriesSummary(series, first, second, teams)
			: null,
		total > meetings.length ? `last ${meetings.length} of ${total}` : null,
	]
		.filter(Boolean)
		.join(" \u00b7 ")

	return (
		<VStack gap="2" alignItems="stretch">
			<HStack justify="space-between" gap="3" flexWrap="wrap">
				<h3 className={sectionHeadingClass}>Head to head</h3>
				{summary && <span className={sectionHeadingClass}>{summary}</span>}
			</HStack>
			{/* A column each, so the scores stack under one another instead of
			    landing wherever a three-letter code and a one- or two-digit
			    number happen to leave them. Scores are right-aligned and
			    tabular, which is what puts 10 under 3.

			    One grid for every row rather than a grid per row: that is what
			    makes the columns agree with each other. Aligned columns carry
			    the eye across on their own here, so there are no rules between
			    rows - five short lines don't need ruling off. */}
			<div
				className={css({
					display: "grid",
					gridTemplateColumns: "auto auto auto auto auto",
					columnGap: "2",
					rowGap: "1",
					justifyContent: "start",
					alignItems: "center",
				})}
			>
				{meetings.map((meeting) => (
					<Fragment key={meeting.gameId}>
						<span className={mutedClass}>{shortDate(meeting.date)}</span>
						<span className={numberClass}>
							{teams[meeting.awayTeamId] ?? ""}
						</span>
						<span className={cx(numberClass, css({ textAlign: "right" }))}>
							{meeting.awayScore}
						</span>
						<span className={mutedClass}>
							{`@ ${teams[meeting.homeTeamId] ?? ""}`}
						</span>
						<span className={cx(numberClass, css({ textAlign: "right" }))}>
							{meeting.homeScore}
						</span>
					</Fragment>
				))}
			</div>
		</VStack>
	)
}

type TrackRecordSide =
	StatContextCard_TrackRecordFragment["rows"][number]["sides"][number]

function TrackRecordRow(props: { label: string; sides: TrackRecordSide[] }) {
	return (
		<HStack justify="space-between" alignItems="baseline" gap="3">
			<span className={css({ fontSize: "sm", color: "fg.muted" })}>
				{props.label}
			</span>
			<HStack gap="4" alignItems="baseline">
				{props.sides.map((side) => (
					<span
						key={side.label}
						className={css({ fontFamily: "mono", fontSize: "sm" })}
					>
						{side.label}{" "}
						{formatWinLoss(side.wins, side.losses)}{" "}
						<span
							className={css({
								color:
									side.netPoints >= 0 ? "success.default" : "danger.default",
							})}
						>
							{formatSignedPoints(side.netPoints)}
						</span>
					</span>
				))}
			</HStack>
		</HStack>
	)
}

// The viewer's own record picking each of this question's two options: every
// question of the same shape and stat they've settled, then this subject
// alone, then home against road, each only when it has enough calls.
function TrackRecordStrip(props: {
	record: StatContextCard_TrackRecordFragment
}) {
	const { record } = props
	return (
		<VStack gap="2" alignItems="stretch">
			<h3 className={sectionHeadingClass}>
				{`Your record \u00b7 ${record.label}`}
			</h3>
			{record.rows.map((row) => (
				<TrackRecordRow
					key={row.label ?? "all"}
					label={row.label ?? "All your calls"}
					sides={row.sides}
				/>
			))}
			<p className={css({ fontSize: "xs", color: "fg.subtle" })}>
				Your settled calls on questions like this one, with points won or lost.
			</p>
		</VStack>
	)
}

export function StatContextCard(props: {
	statContext?: FragmentType<typeof StatContextCardFragment> | null
	trackRecord?: FragmentType<typeof StatContextTrackRecordFragment> | null
	teams: TeamLabels
	// Whether the viewer still has a call to make on this question.
	isCallable: boolean
}) {
	// Open while there's still a call to make, since this sits directly above
	// the pick form and reads as input to it. Once the viewer has called (or
	// the question locked), the decision is made and this is reference rather
	// than input, so it starts out of the way and stays one tap from view.
	const [expanded, setExpanded] = useState(props.isCallable)
	const context = useFragment(StatContextCardFragment, props.statContext)
	const trackRecord = useFragment(
		StatContextTrackRecordFragment,
		props.trackRecord,
	)

	// A season-scoped question has no box-score history to show, but the
	// viewer's own record on the stat still stands on its own.
	const recordOnly = trackRecord ? (
		<Card>
			<Card.Body>
				<TrackRecordStrip record={trackRecord} />
			</Card.Body>
		</Card>
	) : null

	if (!context) return recordOnly

	// Not gated on subjects being present: a pool question deliberately has
	// none, because its ranking stands in for them, and a game-level question
	// has a matchup instead. The real check is below, once all three have been
	// built.
	const ranking = context.ranking
	const matchup = context.matchup
	const columns = context.subjects
		.map((subject) => ({
			subject,
			lead: headline(subject),
			tiles: supportingTiles(subject, props.teams),
		}))
		.filter((column) => column.lead || column.tiles.length > 0)

	// Everything got gated out, so there's nothing worth a card. Renders
	// nothing rather than an empty state, the same as GameStarters.
	if (!matchup && columns.length === 0 && ranking.length === 0) {
		return recordOnly
	}

	const twoUp = matchup ? true : columns.length > 1
	// The sat-out note only makes sense next to a strip that can show one.
	const anyStrip = columns.some(
		(column) => column.subject.recentGames.length >= MIN_LOG,
	)

	return (
		<Card>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					<HStack justify="space-between" alignItems="center">
						<h2 className={sectionHeadingClass}>
							{sectionTitle(context.statLabel)}
						</h2>
						<button
							type="button"
							aria-expanded={expanded}
							onClick={() => setExpanded((open) => !open)}
							className={button({ variant: "ghost", size: "sm" })}
						>
							{expanded ? "Hide" : "Show"}
							{expanded ? <FiChevronUp /> : <FiChevronDown />}
						</button>
					</HStack>

					{expanded && (
						<>
							{ranking.length > 0 && (
								<Ranking
									ranking={ranking}
									defenses={context.defenses}
									teams={props.teams}
								/>
							)}
							<div
								className={css({
									display: "grid",
									gridTemplateColumns: twoUp
										? {
												base: "minmax(0, 1fr)",
												sm: "repeat(2, minmax(0, 1fr))",
											}
										: "minmax(0, 1fr)",
									gap: { base: "5", sm: "6" },
								})}
							>
								{matchup
									? matchup.sides.map((side) => (
											<MatchupColumn
												key={side.teamId}
												side={side}
												focus={matchup.focus}
												/>
										))
									: columns.map((column) => (
											<SubjectColumn
												key={column.subject.label}
												subject={column.subject}
												teams={props.teams}
											/>
										))}
							</div>
							{matchup && (
								<Meetings matchup={matchup} teams={props.teams} />
							)}
							<p className={css({ fontSize: "xs", color: "fg.subtle" })}>
								{matchup
									? "Completed regular-season games this season, up to this one. Head to head is this season only."
									: `From the box scores we resolve against, up to this game.${
											anyStrip
												? " Games a player sat out show as -- and stay out of every average."
												: ""
										}`}
							</p>
							{trackRecord && <TrackRecordStrip record={trackRecord} />}
						</>
					)}
				</VStack>
			</Card.Body>
		</Card>
	)
}

// A trimmed run of the same figures, for a surface where the question is an
// invitation rather than a page: the landing page's try-it stack. Same labels
// and the same thresholds, one type scale down, cut to the headline, the games
// behind it and the two tiles that qualify it.
//
// Folded away by default, unlike the card above. There the viewer arrived to
// call a specific question and the numbers are input to a decision already
// being made; here they are one card into meeting the product, and a block of
// splits opening on them pushes the options they are actually being asked to
// tap out of the fold. The line stays visible so the numbers are known to be
// there, which is the part a visitor can't guess.
const HIGHLIGHT_TILES = 2
const HIGHLIGHT_RANKING = 3

export function StatContextHighlights(props: {
	statContext?: FragmentType<typeof StatContextCardFragment> | null
	teams: TeamLabels
}) {
	const [expanded, setExpanded] = useState(false)
	const context = useFragment(StatContextCardFragment, props.statContext)

	if (!context) return null

	const ranking = context.ranking.slice(0, HIGHLIGHT_RANKING)
	const matchup = context.matchup
	const columns = context.subjects.filter(
		(subject) =>
			headline(subject) !== null ||
			supportingTiles(subject, props.teams).length > 0,
	)
	// Nothing to open, so nothing to offer - a toggle that expands to an empty
	// panel is worse than no toggle.
	if (!matchup && columns.length === 0 && ranking.length === 0) return null

	return (
		<VStack gap="2" alignItems="stretch">
			<HStack justify="space-between" alignItems="center">
				<h3 className={sectionHeadingClass}>
					{sectionTitle(context.statLabel)}
				</h3>
				<button
					type="button"
					aria-expanded={expanded}
					onClick={() => setExpanded((open) => !open)}
					className={button({ variant: "ghost", size: "sm" })}
				>
					{expanded ? "Hide" : "Show"}
					{expanded ? <FiChevronUp /> : <FiChevronDown />}
				</button>
			</HStack>
			{expanded && (
				<>
					{ranking.length > 0 && (
						<Ranking
							ranking={ranking}
							defenses={context.defenses}
							teams={props.teams}
						/>
					)}
					<div
						className={css({
							display: "grid",
							gridTemplateColumns:
								matchup || columns.length > 1
									? { base: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }
									: "minmax(0, 1fr)",
							gap: { base: "3", sm: "4" },
						})}
					>
						{/* Head to head is left off here on purpose: it's a third
						    block on a card that has to hold its height inside the
						    fold, and this surface is an invitation rather than
						    research. */}
						{matchup
							? matchup.sides.map((side) => (
									<MatchupColumn
										key={side.teamId}
										side={side}
										focus={matchup.focus}
										maxTiles={HIGHLIGHT_TILES}
										dense
									/>
								))
							: columns.map((subject) => (
									<SubjectColumn
										key={subject.label}
										subject={subject}
										teams={props.teams}
										maxTiles={HIGHLIGHT_TILES}
										dense
									/>
								))}
					</div>
				</>
			)}
		</VStack>
	)
}
