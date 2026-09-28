import type { QuestionShape } from "@called-my-shot/schemas"
import { match } from "ts-pattern"
import { buildMatchup } from "./matchup"
import {
	homeAwaySplit,
	opponentAllowed,
	type PoolCandidate,
	poolDefenses,
	poolRanking,
	recentGames,
	restSplit,
	type StatContextScope,
	seasonToDate,
	shareOfTeamTotal,
	usageOfTeam,
} from "./queries"
import { recipeFor, usageStatFor } from "./recipes"
import { boxStatSourceFor } from "./stat-source"
import type {
	StatContext,
	StatContextMatchup,
	StatContextPoolDefense,
	StatContextRankedPlayer,
	StatContextSlot,
	StatContextSubject,
} from "./types"

// Fixed across sports on purpose. The query returns what exists, so a league
// with a short season simply yields fewer rows rather than needing a per-sport
// number here. How many of them to show is the page's call, not this layer's.
const LAST_N = 10

// A pool question's list is a shortlist, not a roster dump. Five is enough to
// see who is in front and whether it's close.
const RANK_LIMIT = 5

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
	// id and startsAt are what a matchup needs beyond the two team ids: the id
	// to leave this game out of both records by identity rather than by time
	// alone, and the start to measure each side's days of rest into it.
	game: {
		id: string
		homeTeamId: string
		awayTeamId: string
		startsAt: Date
	} | null
	// From subjectPlayerId / subjectTeamId.
	subject: SubjectRef | null
	// From the options that name a real player or team, in sort order. This is
	// where a head-to-head keeps its two sides; there are no dedicated A/B
	// columns on questions.
	optionSubjects: SubjectRef[]
	// The game's two teams, home first. A game total is about neither side in
	// particular, so it falls back to these.
	competitors: SubjectRef[]
}

// Which sides of a question get cards. Exhaustive on purpose: a new
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
				"player_team_season_stat_leader",
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
			// team_vs_team and game_total_over_under are handled before this
			// function runs: they get a matchup rather than subject columns,
			// because neither carries a stat either side has a log of. The
			// question here is only which sides get one, and for them the answer
			// is still neither. yes_no_prop is free text with no structured
			// subject at all.
			.with("team_vs_team", "game_total_over_under", "yes_no_prop", () => [])
			.exhaustive()
	)
}

// Whether a shape's option pool is a leaderboard rather than a pair. Only the
// game-scoped one for now: a season award's pool is the whole league, which is
// a different query and a different claim ("who leads the league so far" is
// not the same as "who leads tonight").
function ranksPool(shape: QuestionShape): boolean {
	return shape === "player_game_stat_leader"
}

// Whether a shape's context is the game itself rather than a stat line, and
// which number leads if so. Both read the same rows: one asks who wins, the
// other how much the two of them score between them.
function matchupFocus(shape: QuestionShape): StatContextMatchup["focus"] | null {
	if (shape === "team_vs_team") return "winner"
	if (shape === "game_total_over_under") return "scoring"
	return null
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
		subjectKind: source.subject,
		playerId: source.subject === "player" ? subject.playerId : null,
		teamId,
		// A team stat lives in whichever team_game_stats scope its extractor
		// reads from, which is exactly what the source descriptor records.
		teamScope:
			source.subject === "team"
				? source.origin === "athlete"
					? null
					: source.origin
				: null,
		opponentTeamId:
			teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId,
		seasonId: question.seasonId,
		statKeys: [...source.statKeys],
		asOf: question.locksAt,
		ouLine: question.ouLine,
		positions: subject.positions,
	}
	if (source.subject === "team" && !scope.teamScope) return null

	const wants = (slot: StatContextSlot) => slots.has(slot)
	// A stat can ask for the usage card without any column carrying the volume
	// behind it, which is not a failure - it just has no usage to show.
	const usageStat = wants("usage")
		? usageStatFor(source.autoResolveStatKey)
		: null
	const [games, season, splits, rest, allowed, share, usage] =
		await Promise.all([
			wants("recent_form") ? recentGames(scope, LAST_N) : [],
			wants("season_to_date") ? seasonToDate(scope) : null,
			wants("home_away") ? homeAwaySplit(scope) : { home: null, away: null },
			wants("rest") ? restSplit(scope) : null,
			wants("opponent_allowed") ? opponentAllowed(scope) : null,
			wants("share_of_team") ? shareOfTeamTotal(scope) : null,
			usageStat ? usageOfTeam(scope, usageStat) : null,
		])

	// Nothing stored for this side at all.
	if (
		games.length === 0 &&
		!season &&
		!splits.home &&
		!splits.away &&
		!rest &&
		!allowed &&
		!share &&
		!usage
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
		usage,
	}
}

// Everything the cards for one question need, or null when there's nothing
// honest to show. Null is a normal outcome, not a failure: a custom stat, a
// season-scoped shape, a leader pool, an MLB rate whose box-score column is
// season-to-date, or a subject with no stored history all land here.
//
// A head-to-head returns both sides or neither. Showing one player's form
// next to a blank column reads as a comparison when it isn't one, so a side
// with no history takes the whole section down with it. A matchup follows the
// same rule for the same reason - see buildMatchup.
export async function buildStatContext(
	question: StatContextQuestion,
): Promise<StatContext | null> {
	const base = {
		statLabel: question.statName ?? "",
		lastN: LAST_N,
		subjects: [] as StatContextSubject[],
		ranking: [] as StatContextRankedPlayer[],
		defenses: [] as StatContextPoolDefense[],
		matchup: null,
	}

	// Ahead of the stat-source lookup below on purpose. A who-wins question
	// carries no stat at all, so boxStatSourceFor is null for it by definition
	// and that guard would take the shape down before it started.
	//
	// Going around the guard doesn't loosen what it protects. It's there so a
	// card and a settled result can't disagree about where their number came
	// from, and both of these settle off the same final scores the matchup
	// reads: a who-wins question off games.home_score/away_score
	// (resolveGameWinner, db/sync/sync-games.ts), a game total off the
	// final_score box rows ESPN writes from that same scoreboard. Every other
	// shape still has to name the stored column its numbers came from before it
	// gets a card.
	const focus = matchupFocus(question.shape)
	if (focus) {
		const matchup = await buildMatchup(question, focus, LAST_N)
		return matchup ? { ...base, matchup } : null
	}

	const subjects = subjectsFor(question)
	const pooled = ranksPool(question.shape)
	if (subjects.length === 0 && !pooled) return null

	const source = boxStatSourceFor({
		shape: question.shape,
		leagueSlug: question.leagueSlug,
		statName: question.statName,
		customStat: question.customStat,
		statAggregation: question.statAggregation,
	})
	if (!source) return null

	if (pooled) {
		if (!question.seasonId) return null
		const poolScope = {
			seasonId: question.seasonId,
			statKeys: [...source.statKeys],
			asOf: question.locksAt,
		}
		const game = question.game
		// Which defense each candidate is up against, from the game rather than
		// from their stat rows: a player traded midseason has a history against
		// the wrong side of it.
		const candidates: PoolCandidate[] = question.optionSubjects.flatMap(
			(option) =>
				option.playerId
					? [
							{
								playerId: option.playerId,
								opponentTeamId:
									game && option.teamInGameId
										? option.teamInGameId === game.homeTeamId
											? game.awayTeamId
											: game.homeTeamId
										: null,
								isHome: !!game && option.teamInGameId === game.homeTeamId,
							},
						]
					: [],
		)
		// The same per-stat judgement a one-sided card makes: only where the
		// other side's generosity is part of this stat's story is it worth two
		// more numbers on the card.
		const wantsDefenses = recipeFor(source.autoResolveStatKey).includes(
			"opponent_allowed",
		)
		const [ranking, defenses] = await Promise.all([
			poolRanking(poolScope, candidates, RANK_LIMIT),
			wantsDefenses && game
				? poolDefenses(poolScope, [game.homeTeamId, game.awayTeamId])
				: [],
		])
		// Nobody in the pool has a stored appearance, so there is no order to
		// show and a list of names with no numbers is worse than no list.
		if (ranking.length === 0) return null
		return { ...base, ranking, defenses }
	}

	const slots = new Set<StatContextSlot>(recipeFor(source.autoResolveStatKey))
	const built = await Promise.all(
		subjects.map((subject) => cardsFor(subject, question, source, slots)),
	)
	if (built.some((side) => side === null)) return null

	return {
		...base,
		subjects: built.filter((side): side is StatContextSubject => side !== null),
	}
}
