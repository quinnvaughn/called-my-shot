import { match } from "ts-pattern"
import type { AwardVerb, StatAggregation } from "./questions"

// A game-scoped title names only what the question itself asks - never the
// matchup, the opponent, or the date. Everywhere a title renders either shows
// the game right alongside it (QuestionCard's game strip, the game and
// question pages) or puts it back in front with questionTitleWithGame below.
export type TitleInput =
	| {
			shape: "player_stat_over_under"
			playerName: string
			statName: string
			// Pre-formatted by the caller, not a bare number - a rate-stat
			// line (batting average) needs a fixed decimal count a plain
			// number interpolated into the title would silently drop
			// trailing zeros from (".300" reading as ".3").
			ouLine: string
	  }
	| {
			shape: "team_stat_over_under"
			teamName: string
			statName: string
			ouLine: string
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
			statName: string
			ouLine: string
	  }
	| {
			shape: "player_stat_numeric_guess"
			playerName: string
			statName: string
	  }
	| {
			shape: "team_stat_numeric_guess"
			teamName: string
			statName: string
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
	| { shape: "team_vs_team" }
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
			statName: string
	  }
	| {
			shape: "player_season_stat_leader"
			// The curated pool, in the order the creator listed it.
			playerNames: string[]
			statName: string
			// See isRateStat on player_vs_player_season above - the same
			// count-vs-rate distinction, here picking "the most" vs "the
			// highest".
			isRateStat: boolean
			// null when the stat is neither a season total nor a per-game
			// rate - an advanced metric like RAPM is already a rate measured
			// across a full season, so the creator is never asked to pick
			// one and the title states no aggregation at all. Not optional on
			// the season over/under shapes above, whose line means nothing
			// without it.
			statAggregation: StatAggregation | null
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

// teams.conference stores ESPN's abbreviation, which reads correctly in a
// title for most leagues ("AL MVP", "AFC Championship") but not for the NBA,
// whose conferences come back as "East"/"West" where the sentence wants the
// adjective ("Eastern Conference Finals"). Conferences only, deliberately -
// the division values collide with these same names, and "AFC East" / "NL
// West" are already right as stored.
const CONFERENCE_TITLE_NAMES: Record<string, string> = {
	East: "Eastern",
	West: "Western",
}

// ["AL"] + "MVP" -> "AL MVP", ["AL", "NL"] + "MVP" -> "AL/NL MVP" - the
// conference/division qualifier reads in front of the award's own name, same
// order people actually say it in.
function qualifiedAwardName(
	awardName: string,
	awardConferences?: string[],
	awardDivisions?: string[],
): string {
	const conferences = awardConferences
		?.map((c) => CONFERENCE_TITLE_NAMES[c] ?? c)
		.join("/")
	const qualifier = [conferences, awardDivisions?.join("/")]
		.filter(Boolean)
		.join(" ")
	return qualifier ? `${qualifier} ${awardName}` : awardName
}

// "A or B" / "A, B, or C" - a finalist list is a real either/or question, not
// a plain enumeration, so it reads as one the way a comma-only join wouldn't.
// The counterpart to joinWithOr for a list that is being ranked rather than
// chosen between - "among A, B, and C" takes "and", since the pool is one set
// being compared, not a menu of alternatives.
function joinWithAnd(items: string[]): string {
	if (items.length <= 1) return items.join("")
	if (items.length === 2) return `${items[0]} and ${items[1]}`
	return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`
}

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
	return `${input.playerName}: over/under ${input.ouLine} ${statInSentence(input.statName)}`
}

function titleTeamStatOverUnder(
	input: Extract<TitleInput, { shape: "team_stat_over_under" }>,
): string {
	return `${input.teamName}: over/under ${input.ouLine} ${statInSentence(input.statName)}`
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

// "Game total" is what separates this line from a single team's - with no
// team named, a bare "over/under 47.5 points" could be either side's.
function titleGameTotalOverUnder(
	input: Extract<TitleInput, { shape: "game_total_over_under" }>,
): string {
	return `Game total: over/under ${input.ouLine} ${statInSentence(input.statName)}`
}

// --- Numeric guesses ---

function titlePlayerStatNumericGuess(
	input: Extract<TitleInput, { shape: "player_stat_numeric_guess" }>,
): string {
	return `${input.playerName}'s ${statInSentence(input.statName)}`
}

function titleTeamStatNumericGuess(
	input: Extract<TitleInput, { shape: "team_stat_numeric_guess" }>,
): string {
	return `${possessive(input.teamName)} ${statInSentence(input.statName)}`
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
	return `${possessive(input.teamName)} ${displayStatName} for ${input.year}`
}

// --- Vs-shapes ---

// The one template behind all three head-to-heads. They are the same
// question structurally - two named sides, one stat, who comes out ahead -
// and differ only in what scopes them: player_vs_player is bounded by a game,
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
	// 76ers"). A matchup opener is the one place the article is genuinely not
	// spoken - every scoreboard and schedule drops it - so it reads as the
	// normal form rather than as a missing word, and it keeps the two sides
	// symmetric.
	sideAName: string
	sideBName: string
	statName: string
	isRateStat: boolean
	// null for the game-scoped shape, which has no aggregation to state and
	// takes no "this season" suffix - the game it's attached to scopes it.
	statAggregation: StatAggregation | null
}): string {
	const comparison = input.isRateStat ? "a higher" : "more"
	const perGame = input.statAggregation === "per_game" ? " per game" : ""
	const season = input.statAggregation === null ? "" : " this season"
	// Present tense for the game-scoped shape, future for the two season ones -
	// same split, and the same reason, as titlePlayerSeasonStatLeader below.
	// The game shown with a game-scoped matchup already says when it gets
	// measured, so "who has more points" can't be read as anything else.
	// Nothing scopes a season shape that way, and "who has more wins this
	// season" reads as a standings lookup that's true today rather than the
	// end-of-season number resolution actually checks. statAggregation is what
	// distinguishes them: it's null on exactly the game-scoped shape and set on
	// both season ones.
	//
	// "will average" for a per-game season line, because "will have more points
	// per game" is the stiff way to say the thing every box score and broadcast
	// says as "averages 25 points per game". The verb also does the work
	// isRateStat can't: a per-game number is a rate no matter what the
	// underlying stat is, and "average more points per game" stays correct
	// where the bare comparison would need reworking.
	const verb = match(input.statAggregation)
		.with(null, () => "has")
		.with("per_game", () => "will average")
		.with("total", () => "will have")
		.exhaustive()
	return `${input.sideAName} vs ${input.sideBName}: who ${verb} ${comparison} ${statInSentence(input.statName)}${perGame}${season}?`
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

function titleTeamVsTeam(): string {
	return "Who will win?"
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
	return `Who leads the game in ${statInSentence(input.statName)}?`
}

// Deliberately not "who leads in X" the way the game-scoped leader above is
// phrased. That wording inverts on a lower-is-better stat - every baseball
// reader takes "who leads in ERA" as the lower number - and this shape takes
// a freeform stat, so the catalog can't be relied on to keep such stats out.
// "the most"/"the highest" carry the same unambiguous bigger-number-wins
// meaning the head-to-head templates already use, which is what resolution
// needs, since a human marks the winning option correct.
//
// "will have" for the same reason the season head-to-heads use it (see the
// verb comment in titleHeadToHead above) - unconditionally here, since this
// shape is always season-scoped and has no game-scoped variant to share the
// template with.
function titlePlayerSeasonStatLeader(
	input: Extract<TitleInput, { shape: "player_season_stat_leader" }>,
): string {
	const comparison = input.isRateStat ? "the highest" : "the most"
	const perGame = input.statAggregation === "per_game" ? " per game" : ""
	// Same "will average" for a per-game line as titleHeadToHead above, minus
	// its present-tense case - this shape is always season-scoped.
	const verb = match(input.statAggregation)
		.with("per_game", () => "will average")
		.with("total", null, () => "will have")
		.exhaustive()
	// "among <pool>", not the colon-and-or-list that player_award_finalists
	// uses. That template can pose an unscoped superlative ("who will win the
	// MVP: A, B, or C?") because the real winner is guaranteed to be one of the
	// named finalists. This pool carries no such guarantee - it is whoever the
	// creator felt like naming - so an unscoped "who will have the highest RAPM
	// this season" invites the league-wide reading, under which the honest
	// answer can be "none of them". Resolution has no such outcome: it marks an
	// option in the pool correct. "among" is what makes the title ask the
	// question that actually gets resolved.
	return `Who ${verb} ${comparison} ${statInSentence(input.statName)}${perGame} this season among ${joinWithAnd(input.playerNames)}?`
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
	if (input.picksRequired > 1)
		return `Pick the ${name} (${input.picksRequired})`
	return input.verb === "be"
		? `Who will be the ${name}?`
		: `Who will win the ${name}?`
}

function titleTeamSeasonAward(
	input: Extract<TitleInput, { shape: "team_season_award" }>,
): string {
	const name = qualifiedAwardName(
		input.awardName,
		input.awardConferences,
		input.awardDivisions,
	)
	if (input.picksRequired > 1)
		return `Pick the ${name} (${input.picksRequired})`
	return input.verb === "be"
		? `Who will be the ${name}?`
		: `Who will win the ${name}?`
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
	return match(input)
		.with({ shape: "player_stat_over_under" }, titlePlayerStatOverUnder)
		.with({ shape: "team_stat_over_under" }, titleTeamStatOverUnder)
		.with(
			{ shape: "player_season_stat_over_under" },
			titlePlayerSeasonStatOverUnder,
		)
		.with(
			{ shape: "team_season_stat_over_under" },
			titleTeamSeasonStatOverUnder,
		)
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
		.with({ shape: "player_season_stat_leader" }, titlePlayerSeasonStatLeader)
		.with({ shape: "yes_no_prop" }, titleYesNoProp)
		.with({ shape: "player_season_award" }, titlePlayerSeasonAward)
		.with({ shape: "team_season_award" }, titleTeamSeasonAward)
		.with({ shape: "player_award_finalists" }, titlePlayerAwardFinalists)
		.exhaustive()
}

// Teams are nullable only because drizzle types every `one` relation that
// way - a game always has both.
type TitleGame = {
	awayTeam: { abbreviation: string } | null
	homeTeam: { abbreviation: string } | null
}

// For the places a title shows up with nothing else naming the game - a
// notification, the resolution email, a share card, a browser tab:
// "DAL @ NYG · Who will win?". A question with no game passes through as is.
export function questionTitleWithGame(
	title: string,
	game: TitleGame | null | undefined,
): string {
	return game?.awayTeam && game.homeTeam
		? `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation} · ${title}`
		: title
}
