import { match } from "ts-pattern"
import type { AwardVerb, StatAggregation } from "./questions"

// gameDate is optional on every shape (even the three award ones, where it's
// never actually set) rather than a separate per-shape concern - whether a
// question has a real-world game attached is an instance-level fact (gameId
// on the questions table), not something fixed by shape the way statName or
// ouLine are. Set from the picked game's own startsAt (ISO string, same
// reasoning as locksAt elsewhere in this package - stays a plain string end
// to end, parsed only where actually needed).
type WithGameDate = { gameDate?: string }

export type TitleInput = WithGameDate &
	(
		| {
				shape: "player_stat_over_under"
				playerName: string
				statName: string
				// Pre-formatted by the caller, not a bare number - a rate-stat
				// line (batting average) needs a fixed decimal count a plain
				// number interpolated into the title would silently drop
				// trailing zeros from (".300" reading as ".3").
				ouLine: string
				opponentTeamName: string
		  }
		| {
				shape: "team_stat_over_under"
				teamName: string
				statName: string
				ouLine: string
				opponentTeamName: string
		  }
		| {
				shape: "player_season_stat_over_under"
				playerName: string
				statName: string
				ouLine: string
				statAggregation: StatAggregation
		  }
		| {
				shape: "team_season_stat_over_under"
				teamName: string
				statName: string
				ouLine: string
				statAggregation: StatAggregation
		  }
		| {
				shape: "game_total_over_under"
				awayTeamName: string
				homeTeamName: string
				statName: string
				ouLine: string
		  }
		| {
				shape: "player_stat_numeric_guess"
				playerName: string
				statName: string
				opponentTeamName: string
		  }
		| {
				shape: "team_stat_numeric_guess"
				teamName: string
				statName: string
				opponentTeamName: string
		  }
		| {
				shape: "team_season_stat_numeric_guess"
				teamName: string
				statName: string
				// The real calendar year this season's guess resolves in (e.g.
				// 2026) - unlike every other season-scoped shape, this one names
				// the year directly in its title ("...in 2026") rather than relying
				// on "this season," since a caller reading a win-total question
				// outside its own season context (a feed, a notification) still
				// needs to know which year it's about.
				year: number
		  }
		| {
				shape: "player_vs_player"
				playerAName: string
				playerBName: string
				statName: string
				// See isRateStat on player_vs_player_season below - same "more" vs
				// "a higher" choice, just scoped to one game.
				isRateStat: boolean
		  }
		| {
				shape: "player_vs_player_season"
				playerAName: string
				playerBName: string
				statName: string
				statAggregation: StatAggregation
				// Picks "more" (a count) vs "a higher" (a rate) - see
				// titleSeasonHeadToHead. Required, not optional-defaulting-to-false:
				// silently getting this wrong produces a title that reads as broken
				// English rather than anything a caller would report.
				isRateStat: boolean
		  }
		| { shape: "team_vs_team"; awayTeamName: string; homeTeamName: string }
		| {
				shape: "team_vs_team_season"
				teamAName: string
				teamBName: string
				statName: string
				statAggregation: StatAggregation
				// See isRateStat on player_vs_player_season above.
				isRateStat: boolean
		  }
		| {
				shape: "player_game_stat_leader"
				awayTeamName: string
				homeTeamName: string
				statName: string
		  }
		| { shape: "yes_no_prop"; subjectName: string | null; eventClause: string }
		| {
				shape: "player_season_award"
				awardName: string
				verb: AwardVerb
				picksRequired: number
				// Prepended to awardName when set - ["AL"] + "MVP" -> "AL MVP",
				// ["AL", "NL"] + "MVP" -> "AL/NL MVP". Not required - most awards
				// (NBA MVP, NFL MVP) are genuinely league-wide and leave both unset.
				awardConferences?: string[]
				awardDivisions?: string[]
		  }
		| {
				shape: "team_season_award"
				awardName: string
				verb: AwardVerb
				picksRequired: number
				awardConferences?: string[]
				awardDivisions?: string[]
		  }
		| {
				shape: "player_award_finalists"
				awardName: string
				finalistNames: string[]
		  }
	)

// Short, no year - this is a scannability aid ("when's this happening"), not
// a full timestamp; the game itself (with its real date/time) is always
// shown alongside the question elsewhere in the app too.
function formatGameDate(iso: string): string {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
	}).format(new Date(iso))
}

// ["AL"] + "MVP" -> "AL MVP", ["AL", "NL"] + "MVP" -> "AL/NL MVP" - the
// conference/division qualifier reads in front of the award's own name, same
// order people actually say it in.
function qualifiedAwardName(
	awardName: string,
	awardConferences?: string[],
	awardDivisions?: string[],
): string {
	const qualifier = [awardConferences?.join("/"), awardDivisions?.join("/")]
		.filter(Boolean)
		.join(" ")
	return qualifier ? `${qualifier} ${awardName}` : awardName
}

// "A or B" / "A, B, or C" - a finalist list is a real either/or question, not
// a plain enumeration, so it reads as one the way a comma-only join wouldn't.
function joinWithOr(items: string[]): string {
	if (items.length <= 1) return items.join("")
	if (items.length === 2) return `${items[0]} or ${items[1]}`
	return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`
}

// Team names are virtually always already plural ("Twins," "Heat" being the
// rare exception) - "Twins's" reads wrong where "Twins'" is correct, so this
// only appends the bare apostrophe when the name already ends in "s".
function possessive(name: string): string {
	return name.endsWith("s") ? `${name}'` : `${name}'s`
}

// Catalog stat names are stored title-cased ("Passing Yards", "On-Base
// Percentage") because they are written for label position - a picker row, a
// column header, the old "Points: A vs B" title format. Dropped into the
// middle of a sentence they read as shouting, so the sentence-shaped
// templates lower-case them first.
//
// Not a plain toLowerCase(): "ERA", "WHIP" and "RBIs" have to survive intact.
// A word carrying two or more capitals is taken as an acronym and left
// exactly as it is; everything else lower-cases. Matching runs of letters
// (rather than splitting on spaces) is what makes hyphenated names work -
// "On-Base" is two one-capital words, so it becomes "on-base", while "RBIs"
// is a single three-capital word and stays put.
function statInSentence(statName: string): string {
	return statName.replace(/[A-Za-z]+/g, (word) =>
		(word.match(/[A-Z]/g) ?? []).length >= 2 ? word : word.toLowerCase(),
	)
}

// --- Over/unders ---

function titlePlayerStatOverUnder(
	input: Extract<TitleInput, { shape: "player_stat_over_under" }>,
): string {
	return `${input.playerName}: over/under ${input.ouLine} ${statInSentence(input.statName)} vs the ${input.opponentTeamName}`
}

function titleTeamStatOverUnder(
	input: Extract<TitleInput, { shape: "team_stat_over_under" }>,
): string {
	return `${input.teamName}: over/under ${input.ouLine} ${statInSentence(input.statName)} vs the ${input.opponentTeamName}`
}

function titlePlayerSeasonStatOverUnder(
	input: Extract<TitleInput, { shape: "player_season_stat_over_under" }>,
): string {
	return input.statAggregation === "per_game"
		? `${input.playerName}: over/under ${input.ouLine} ${statInSentence(input.statName)} per game this season`
		: `${input.playerName}: over/under ${input.ouLine} ${statInSentence(input.statName)} this season`
}

function titleTeamSeasonStatOverUnder(
	input: Extract<TitleInput, { shape: "team_season_stat_over_under" }>,
): string {
	return input.statAggregation === "per_game"
		? `${input.teamName}: over/under ${input.ouLine} ${statInSentence(input.statName)} per game this season`
		: `${input.teamName}: over/under ${input.ouLine} ${statInSentence(input.statName)} this season`
}

function titleGameTotalOverUnder(
	input: Extract<TitleInput, { shape: "game_total_over_under" }>,
): string {
	return `${input.awayTeamName} @ ${input.homeTeamName}: over/under ${input.ouLine} ${statInSentence(input.statName)}`
}

// --- Numeric guesses ---

function titlePlayerStatNumericGuess(
	input: Extract<TitleInput, { shape: "player_stat_numeric_guess" }>,
): string {
	return `Guess ${input.playerName}'s ${statInSentence(input.statName)} vs the ${input.opponentTeamName}`
}

function titleTeamStatNumericGuess(
	input: Extract<TitleInput, { shape: "team_stat_numeric_guess" }>,
): string {
	return `Guess the ${possessive(input.teamName)} ${statInSentence(input.statName)} vs the ${input.opponentTeamName}`
}

// "Wins" (the stat catalog's own lookup name, capitalized) reads wrong in a
// sentence ("...Wins for 2026") - "win total" is what every league's actual
// win-total guess says, so that translation lives here once, not repeated
// per league in the catalog (see RECURRING_QUESTION_CATALOG - a prior version
// asked each league's catalog entry to opt into this phrasing separately,
// which is exactly how NBA/NFL ended up saying "Wins" while MLB said "win
// total"). Any other statName (a future non-win-total use of this general
// shape, e.g. "Net Rating") passes through unchanged.
function titleTeamSeasonStatNumericGuess(
	input: Extract<TitleInput, { shape: "team_season_stat_numeric_guess" }>,
): string {
	const displayStatName =
		input.statName === "Wins" ? "win total" : statInSentence(input.statName)
	return `Guess the ${possessive(input.teamName)} ${displayStatName} for ${input.year}`
}

// --- Vs-shapes ---

// The one template behind all three head-to-heads. They are the same
// question structurally - two named sides, one stat, who comes out ahead -
// and differ only in what scopes them: player_vs_player is bounded by a game
// (whose date generateQuestionTitle appends, "... more points? (Mar 3)"),
// the two season shapes by a season. So scope is a parameter here rather
// than a reason to keep three near-identical templates that drift apart the
// next time the wording changes.
//
// They read as one question rather than a label-prefixed fragment ("Points:
// A vs B this season"), so the two sides lead and the thing being compared
// lands where a reader is already expecting it.
//
// "more" vs "a higher" tracks whether the stat is a count or a rate: "more
// batting average" is not English, and the catalog has five genuine rate
// stats (Batting Average, On-Base Percentage, Slugging Percentage, ERA,
// WHIP). Both wordings mean the same unambiguous thing - the bigger number
// wins - which is what resolution needs, since a human marks one side
// correct. Deliberately NOT "who leads in ERA", which every baseball reader
// would take as the lower number, inverting the question against a
// lower-is-better stat.
function titleHeadToHead(input: {
	// Both sides bare, teams included ("Boston Celtics vs Philadelphia
	// 76ers"), unlike the prepositional tails elsewhere in this file that do
	// take an article ("... 3-pointers made vs the 76ers"). A matchup opener
	// is the one place the article is genuinely not spoken - every scoreboard
	// and schedule drops it - so it reads as the normal form rather than as a
	// missing word, and it keeps the two sides symmetric.
	sideAName: string
	sideBName: string
	statName: string
	isRateStat: boolean
	// null for the game-scoped shape, which has no aggregation to state and
	// takes no "this season" suffix - its game date is what scopes it instead.
	statAggregation: StatAggregation | null
}): string {
	const comparison = input.isRateStat ? "a higher" : "more"
	const perGame = input.statAggregation === "per_game" ? " per game" : ""
	const season = input.statAggregation === null ? "" : " this season"
	return `${input.sideAName} vs ${input.sideBName}: who has ${comparison} ${statInSentence(input.statName)}${perGame}${season}?`
}

function titlePlayerVsPlayer(
	input: Extract<TitleInput, { shape: "player_vs_player" }>,
): string {
	return titleHeadToHead({
		sideAName: input.playerAName,
		sideBName: input.playerBName,
		statName: input.statName,
		isRateStat: input.isRateStat,
		statAggregation: null,
	})
}

function titlePlayerVsPlayerSeason(
	input: Extract<TitleInput, { shape: "player_vs_player_season" }>,
): string {
	return titleHeadToHead({
		sideAName: input.playerAName,
		sideBName: input.playerBName,
		statName: input.statName,
		isRateStat: input.isRateStat,
		statAggregation: input.statAggregation,
	})
}

function titleTeamVsTeam(
	input: Extract<TitleInput, { shape: "team_vs_team" }>,
): string {
	return `${input.awayTeamName} @ ${input.homeTeamName}: who will win?`
}

// Needs no "Wins" -> "win total" translation, unlike
// titleTeamSeasonStatNumericGuess above, where the stat sits in possessive
// position ("the Celtics' win total for 2026"). Here the plain lower-cased
// name already reads right: "who has more wins this season".
function titleTeamVsTeamSeason(
	input: Extract<TitleInput, { shape: "team_vs_team_season" }>,
): string {
	return titleHeadToHead({
		sideAName: input.teamAName,
		sideBName: input.teamBName,
		statName: input.statName,
		isRateStat: input.isRateStat,
		statAggregation: input.statAggregation,
	})
}

function titlePlayerGameStatLeader(
	input: Extract<TitleInput, { shape: "player_game_stat_leader" }>,
): string {
	return `${input.awayTeamName} @ ${input.homeTeamName}: who leads in ${statInSentence(input.statName)}?`
}

// --- Yes/no ---

function titleYesNoProp(
	input: Extract<TitleInput, { shape: "yes_no_prop" }>,
): string {
	return input.subjectName
		? `Will ${input.subjectName} ${input.eventClause}?`
		: `Will ${input.eventClause}?`
}

// --- Awards ---

function titlePlayerSeasonAward(
	input: Extract<TitleInput, { shape: "player_season_award" }>,
): string {
	const name = qualifiedAwardName(
		input.awardName,
		input.awardConferences,
		input.awardDivisions,
	)
	if (input.picksRequired > 1) return `Pick the ${name} (${input.picksRequired})`
	return input.verb === "be" ? `Who will be the ${name}?` : `Who will win the ${name}?`
}

function titleTeamSeasonAward(
	input: Extract<TitleInput, { shape: "team_season_award" }>,
): string {
	const name = qualifiedAwardName(
		input.awardName,
		input.awardConferences,
		input.awardDivisions,
	)
	if (input.picksRequired > 1) return `Pick the ${name} (${input.picksRequired})`
	return input.verb === "be" ? `Who will be the ${name}?` : `Who will win the ${name}?`
}

function titlePlayerAwardFinalists(
	input: Extract<TitleInput, { shape: "player_award_finalists" }>,
): string {
	return `Who will win the ${input.awardName}: ${joinWithOr(input.finalistNames)}?`
}

// The one place a question's title is decided - generated from the shape's
// own validated structured fields at creation time. The create-question form
// prefills the creator's title field from this rather than trusting it as
// the only source, so most titles stay consistent in format/voice without
// blocking on getting every template's phrasing perfect (see title on
// createQuestionSchema).
export function generateQuestionTitle(input: TitleInput): string {
	const base = match(input)
		.with({ shape: "player_stat_over_under" }, titlePlayerStatOverUnder)
		.with({ shape: "team_stat_over_under" }, titleTeamStatOverUnder)
		.with(
			{ shape: "player_season_stat_over_under" },
			titlePlayerSeasonStatOverUnder,
		)
		.with({ shape: "team_season_stat_over_under" }, titleTeamSeasonStatOverUnder)
		.with({ shape: "game_total_over_under" }, titleGameTotalOverUnder)
		.with({ shape: "player_stat_numeric_guess" }, titlePlayerStatNumericGuess)
		.with({ shape: "team_stat_numeric_guess" }, titleTeamStatNumericGuess)
		.with(
			{ shape: "team_season_stat_numeric_guess" },
			titleTeamSeasonStatNumericGuess,
		)
		.with({ shape: "player_vs_player" }, titlePlayerVsPlayer)
		.with({ shape: "player_vs_player_season" }, titlePlayerVsPlayerSeason)
		.with({ shape: "team_vs_team" }, titleTeamVsTeam)
		.with({ shape: "team_vs_team_season" }, titleTeamVsTeamSeason)
		.with({ shape: "player_game_stat_leader" }, titlePlayerGameStatLeader)
		.with({ shape: "yes_no_prop" }, titleYesNoProp)
		.with({ shape: "player_season_award" }, titlePlayerSeasonAward)
		.with({ shape: "team_season_award" }, titleTeamSeasonAward)
		.with({ shape: "player_award_finalists" }, titlePlayerAwardFinalists)
		.exhaustive()

	return input.gameDate ? `${base} (${formatGameDate(input.gameDate)})` : base
}
