import type { QuestionShape } from "@called-my-shot/schemas"
import { match } from "ts-pattern"
import {
	homeAwaySplit,
	opponentAllowed,
	recentGames,
	restSplit,
	type StatContextScope,
	seasonToDate,
	shareOfTeamTotal,
} from "./queries"
import { recipeFor } from "./recipes"
import { boxStatSourceFor } from "./stat-source"
import type { StatContext, StatContextSlot, StatContextSubject } from "./types"

// Fixed across sports on purpose. The query returns what exists, so a league
// with a short season simply yields fewer rows rather than needing a per-sport
// number here. How many of them to show is the page's call, not this layer's.
const LAST_N = 10

// One side a question can be about, with its team in this game already
// resolved by the caller - null when the player isn't on either competitor,
// which drops the cards that need a team rather than guessing one.
export type SubjectRef = {
	label: string
	playerId: string | null
	teamId: string | null
	positions: string[]
	teamInGameId: string | null
}

export type StatContextQuestion = {
	shape: QuestionShape
	leagueSlug: string
	statName: string | null
	customStat: string | null
	statAggregation: "total" | "per_game" | null
	ouLine: number | null
	locksAt: Date
	seasonId: string | null
	game: { homeTeamId: string; awayTeamId: string } | null
	// From subjectPlayerId / subjectTeamId.
	subject: SubjectRef | null
	// From the options that name a real player or team, in sort order. This is
	// where a head-to-head keeps its two sides; there are no dedicated A/B
	// columns on questions.
	optionSubjects: SubjectRef[]
}

// Which sides of a question get cards. Exhaustive on purpose: a nineteenth
// shape won't compile until someone decides, including deciding "none".
function subjectsFor(question: StatContextQuestion): SubjectRef[] {
	return (
		match(question.shape)
			.returnType<SubjectRef[]>()
			.with(
				"player_stat_over_under",
				"player_stat_numeric_guess",
				"team_stat_over_under",
				"team_stat_numeric_guess",
				() => (question.subject ? [question.subject] : []),
			)
			// Both sides, side by side. Same stat, same game, same cards - the only
			// difference from a one-sided question is that it runs twice.
			.with("player_vs_player", () => question.optionSubjects.slice(0, 2))
			// A pool, not a pair. Ten game logs is a table rather than a card, and
			// the useful view is a ranked one column wide, so these wait for a card
			// that's actually shaped like that.
			.with(
				"player_game_stat_leader",
				"player_season_stat_leader",
				"player_award_finalists",
				"player_season_award",
				"team_season_award",
				() => [],
			)
			// Season-scoped: the number comes from ESPN's season endpoints, and a
			// season total rebuilt from stored games is a different figure. Out
			// until there's a card that says which one it is.
			.with(
				"player_vs_player_season",
				"team_vs_team_season",
				"player_season_stat_over_under",
				"team_season_stat_over_under",
				"team_season_stat_numeric_guess",
				() => [],
			)
			// team_vs_team asks who wins and carries no stat at all, so there is
			// nothing to build a log of. game_total_over_under is about the game
			// rather than either side, and yes_no_prop is free text with no
			// structured subject.
			.with("team_vs_team", "game_total_over_under", "yes_no_prop", () => [])
			.exhaustive()
	)
}

async function cardsFor(
	subject: SubjectRef,
	question: StatContextQuestion,
	source: NonNullable<ReturnType<typeof boxStatSourceFor>>,
	slots: Set<StatContextSlot>,
): Promise<StatContextSubject | null> {
	const game = question.game
	if (!game || !question.seasonId) return null

	const teamId =
		source.subject === "team" ? subject.teamId : subject.teamInGameId
	if (!teamId) return null

	const scope: StatContextScope = {
		playerId: source.subject === "player" ? subject.playerId : null,
		teamId,
		opponentTeamId:
			teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId,
		seasonId: question.seasonId,
		statKey: source.statKey,
		asOf: question.locksAt,
		ouLine: question.ouLine,
		positions: subject.positions,
	}

	const wants = (slot: StatContextSlot) => slots.has(slot)
	const [games, season, splits, rest, allowed, share] = await Promise.all([
		wants("recent_form") ? recentGames(scope, LAST_N) : [],
		wants("season_to_date") ? seasonToDate(scope) : null,
		wants("home_away") ? homeAwaySplit(scope) : { home: null, away: null },
		wants("rest") ? restSplit(scope) : null,
		wants("opponent_allowed") ? opponentAllowed(scope) : null,
		wants("share_of_team") ? shareOfTeamTotal(scope) : null,
	])

	// Nothing stored for this side at all.
	if (
		games.length === 0 &&
		!season &&
		!splits.home &&
		!splits.away &&
		!rest &&
		!allowed &&
		!share
	) {
		return null
	}

	return {
		label: subject.label,
		playerId: subject.playerId,
		teamId: subject.teamId,
		recentGames: games,
		seasonToDate: season,
		home: splits.home,
		away: splits.away,
		rest,
		opponentAllowed: allowed,
		teamShare: share,
	}
}

// Everything the cards for one question need, or null when there's nothing
// honest to show. Null is a normal outcome, not a failure: a custom stat, a
// season-scoped shape, a leader pool, an MLB rate whose box-score column is
// season-to-date, or a subject with no stored history all land here.
//
// A head-to-head returns both sides or neither. Showing one player's form
// next to a blank column reads as a comparison when it isn't one, so a side
// with no history takes the whole section down with it.
export async function buildStatContext(
	question: StatContextQuestion,
): Promise<StatContext | null> {
	const subjects = subjectsFor(question)
	if (subjects.length === 0) return null

	const source = boxStatSourceFor({
		shape: question.shape,
		leagueSlug: question.leagueSlug,
		statName: question.statName,
		customStat: question.customStat,
		statAggregation: question.statAggregation,
	})
	if (!source) return null

	const slots = new Set<StatContextSlot>(recipeFor(source.autoResolveStatKey))
	const built = await Promise.all(
		subjects.map((subject) => cardsFor(subject, question, source, slots)),
	)
	if (built.some((side) => side === null)) return null

	return {
		statLabel: question.statName ?? "",
		lastN: LAST_N,
		subjects: built.filter((side): side is StatContextSubject => side !== null),
	}
}
