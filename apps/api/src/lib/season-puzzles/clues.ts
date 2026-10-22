import type { TeamSeason, TeamSeasonLeader } from "../../db/schema"
import type { SeasonLeague } from "./archive-parse"

// A day's six clues, written from an archived season, from vague to a near
// giveaway:
// 1. the record and scoring, which say how good the team was and roughly
//    when, but not who;
// 2. how it ended, and where it finished in its division;
// 3. a stat line with no name;
// 4. the division, by the name it had that season;
// 5. a second leader, named;
// 6. the team's best-known leader, named.
// Nothing names the team, its city or its division rival.

type Season = Pick<
	TeamSeason,
	| "year"
	| "wins"
	| "losses"
	| "ties"
	| "otLosses"
	| "pointsFor"
	| "pointsAgainst"
	| "conference"
	| "division"
	| "divisionRank"
	| "outcome"
	| "roundsFromFinal"
	| "leaders"
>

const number = (n: number) => n.toLocaleString("en-US")

const ORDINAL_SUFFIX: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" }

function ordinal(n: number): string {
	const tens = n % 100
	if (tens >= 11 && tens <= 13) return `${n}th`
	return `${n}${ORDINAL_SUFFIX[n % 10] ?? "th"}`
}

// "398/578, 4806 YDS, 50 TD, 8 INT" as a sentence reads it: "398 of 578,
// 4,806 yards, 50 TD, 8 INT".
export function readableLine(line: string): string {
	return line
		.replace(/(\d+)\/(\d+)/, "$1 of $2")
		.replace(/(\d+) CAR\b/, "$1 carries")
		.replace(/(\d+) REC\b/, "$1 catches")
		.replace(
			/(\d+) YDS\b/,
			(_, yards: string) => `${number(Number(yards))} yards`,
		)
}

// W-L, with ties when there were any (the NFL, the old NHL) and overtime
// losses after them (the NHL since 1999-2000).
function record(s: Season): string {
	const parts = [s.wins, s.losses]
	if (s.ties > 0) parts.push(s.ties)
	if (s.otLosses > 0) parts.push(s.otLosses)
	return parts.join("-")
}

// The scoring half of clue 1. Null where ESPN's standings for an older
// season carry no point totals.
const SCORING: Record<SeasonLeague, (s: Season) => string> = {
	nfl: (s) =>
		`Scored ${number(s.pointsFor)} points and allowed ${number(s.pointsAgainst)}.`,
	nba: (s) => {
		const games = s.wins + s.losses
		const per = (total: number) => (games > 0 ? total / games : 0).toFixed(1)
		return `Averaged ${per(s.pointsFor)} points a game and allowed ${per(s.pointsAgainst)}.`
	},
	mlb: (s) =>
		`Scored ${number(s.pointsFor)} runs and allowed ${number(s.pointsAgainst)}.`,
	nhl: (s) => `Scored ${s.pointsFor} goals and allowed ${s.pointsAgainst}.`,
}

function recordClue(league: SeasonLeague, s: Season): string {
	const standingPoints =
		league === "nhl" ? `, ${2 * s.wins + s.ties + s.otLosses} points` : ""
	const scoring = s.pointsFor > 0 ? ` ${SCORING[league](s)}` : ""
	return `Went ${record(s)}${standingPoints}.${scoring}`
}

// What each league calls its final and the rounds before it, counted back
// from the final. Older brackets with fewer rounds just never reach the
// end of the list.
const ROUNDS: Record<
	SeasonLeague,
	{ won: string; final: string; before: string[] }
> = {
	nfl: {
		won: "Won the Super Bowl.",
		final: "Lost in the Super Bowl.",
		before: [
			"Lost in the conference championship game.",
			"Lost in the divisional round.",
			"Lost in the wild card round.",
		],
	},
	nba: {
		won: "Won the NBA title.",
		final: "Lost in the NBA Finals.",
		before: [
			"Lost in the conference finals.",
			"Lost in the conference semifinals.",
			"Lost in the first round.",
		],
	},
	mlb: {
		won: "Won the World Series.",
		final: "Lost in the World Series.",
		before: [
			"Lost in the League Championship Series.",
			"Lost in the Division Series.",
			"Lost in the Wild Card round.",
		],
	},
	nhl: {
		won: "Won the Stanley Cup.",
		final: "Lost in the Stanley Cup Final.",
		before: [
			"Lost in the conference final.",
			"Lost in the second round.",
			"Lost in the first round.",
		],
	},
}

function ending(league: SeasonLeague, s: Season): string {
	const rounds = ROUNDS[league]
	if (s.outcome === "champion") return rounds.won
	if (s.outcome === "finalist") return rounds.final
	if (s.outcome === "missed") return "Missed the playoffs."
	const before = rounds.before
	const index = Math.min(
		(s.roundsFromFinal ?? before.length) - 1,
		before.length - 1,
	)
	return before[index] ?? "Lost in the first round."
}

function finish(s: Season): string {
	if (!s.divisionRank) return ""
	const group = s.division ? "division" : "conference"
	return `Finished ${ordinal(s.divisionRank)} in their ${group}. `
}

// The season's division, or its conference where ESPN has no divisions
// for the league. The NBA's divisions go by one word ("Atlantic"), the rest
// by full names ("AFC Central", "American League East").
function groupName(league: SeasonLeague, s: Season): string | null {
	if (s.division) {
		return league === "nba" ? `${s.division} Division` : s.division
	}
	return s.conference
}

type LeaderClues = {
	// Clue 3: a line with no name, the first not already named in clue 5.
	unnamed: { category: string; text: (l: TeamSeasonLeader) => string }[]
	// Clue 5: the first of these led by someone other than the star.
	second: { category: string; text: (l: TeamSeasonLeader) => string }[]
	// Clue 6.
	star: { category: string; text: (l: TeamSeasonLeader) => string }
}

const LEADER_CLUES: Record<SeasonLeague, LeaderClues> = {
	nfl: {
		unnamed: [
			{
				category: "receivingLeader",
				text: (l) => `Their leading receiver: ${readableLine(l.line)}.`,
			},
			{
				category: "rushingLeader",
				text: (l) => `Their leading rusher: ${readableLine(l.line)}.`,
			},
		],
		second: [
			{
				category: "rushingLeader",
				text: (l) =>
					`${l.athlete} led them in rushing: ${readableLine(l.line)}.`,
			},
			{
				category: "receivingLeader",
				text: (l) =>
					`${l.athlete} led them in receiving: ${readableLine(l.line)}.`,
			},
		],
		star: {
			category: "passingLeader",
			text: (l) => `${l.athlete} led them in passing: ${readableLine(l.line)}.`,
		},
	},
	nba: {
		unnamed: [
			{
				category: "reboundsPerGame",
				text: (l) => `Their leading rebounder averaged ${l.line} a game.`,
			},
			{
				category: "assistsPerGame",
				text: (l) => `Their assists leader averaged ${l.line} a game.`,
			},
		],
		second: [
			{
				category: "assistsPerGame",
				text: (l) => `${l.athlete} led them in assists, ${l.line} a game.`,
			},
			{
				category: "reboundsPerGame",
				text: (l) => `${l.athlete} led them in rebounds, ${l.line} a game.`,
			},
		],
		star: {
			category: "pointsPerGame",
			text: (l) => `${l.athlete} led them in scoring, ${l.line} a game.`,
		},
	},
	mlb: {
		unnamed: [
			{
				category: "wins",
				text: (l) => `Their winningest pitcher won ${l.line} games.`,
			},
			{
				category: "avg",
				text: (l) => `Their batting average leader hit ${l.line}.`,
			},
		],
		second: [
			{
				category: "avg",
				text: (l) => `${l.athlete} led them in batting average at ${l.line}.`,
			},
			{
				category: "wins",
				text: (l) => `${l.athlete} led their pitchers with ${l.line} wins.`,
			},
		],
		star: {
			category: "homeRuns",
			text: (l) => `${l.athlete} led them with ${l.line} home runs.`,
		},
	},
	nhl: {
		unnamed: [
			{
				category: "wins",
				text: (l) => `Their top goalie won ${l.line} games.`,
			},
			{
				category: "assists",
				text: (l) => `Their assists leader had ${l.line}.`,
			},
			{
				category: "goals",
				text: (l) => `Their top goal scorer had ${l.line}.`,
			},
		],
		second: [
			{
				category: "goals",
				text: (l) => `${l.athlete} led them with ${l.line} goals.`,
			},
			{
				category: "assists",
				text: (l) => `${l.athlete} led them with ${l.line} assists.`,
			},
			{
				category: "wins",
				text: (l) => `${l.athlete} led their goalies with ${l.line} wins.`,
			},
		],
		star: {
			category: "points",
			text: (l) => `${l.athlete} led them with ${l.line} points.`,
		},
	},
}

// The six clues for a season, or null when its leaders can't make them.
export function seasonClues(
	league: SeasonLeague,
	season: Season,
): string[] | null {
	const leaders = new Map(season.leaders.map((l) => [l.category, l]))
	const plan = LEADER_CLUES[league]
	const star = leaders.get(plan.star.category)
	if (!star) return null

	const seconds = plan.second.filter((c) => leaders.has(c.category))
	const second =
		seconds.find((c) => leaders.get(c.category)?.athlete !== star.athlete) ??
		seconds[0]
	const secondLeader = second && leaders.get(second.category)
	// A category clue 5 doesn't already name, so clue 3 tells you something
	// new.
	const unnamedOptions = plan.unnamed.filter((c) => leaders.has(c.category))
	const unnamed =
		unnamedOptions.find((c) => c.category !== second?.category) ??
		unnamedOptions[0]
	const unnamedLeader = unnamed && leaders.get(unnamed.category)
	const group = groupName(league, season)
	if (!unnamed || !unnamedLeader || !second || !secondLeader || !group) {
		return null
	}

	return [
		recordClue(league, season),
		`${finish(season)}${ending(league, season)}`,
		unnamed.text(unnamedLeader),
		`Played in the ${group}.`,
		second.text(secondLeader),
		plan.star.text(star),
	]
}
