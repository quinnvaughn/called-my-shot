// The kinds of card the derivation layer can produce. Each is one function
// over stored box-score rows, written once and sport-blind - nothing in here
// or in queries.ts branches on league or sport. Which of them a given question
// actually gets is decided per stat, in recipes.ts.
export const STAT_CONTEXT_SLOTS = [
	"recent_form",
	"season_to_date",
	"home_away",
	"rest",
	"opponent_allowed",
	"share_of_team",
] as const

export type StatContextSlot = (typeof STAT_CONTEXT_SLOTS)[number]

// One appearance, as a game log reads it.
export type StatContextGame = {
	gameId: string
	date: Date
	opponentTeamId: string
	isHome: boolean
	// Null when the athlete didn't play, or when ESPN recorded no number for
	// them in this column. The two are told apart by didNotPlay, because a
	// blank line and a night off are different facts and a game log that
	// conflates them lies about recent form.
	value: number | null
	didNotPlay: boolean
}

// An aggregate over some set of appearances. `games` counts appearances the
// number is actually built from, never games sat out.
export type StatContextSplit = {
	games: number
	total: number
	mean: number
	// How many of those appearances cleared the question's line, when it has
	// one. Null for a question with no line to clear.
	overLine: number | null
}

export type StatContextRest = {
	// The subject's own median days of rest this season. Fixed day counts
	// would need per-league numbers (NFL 6/7/10+, NBA 0/1/2, MLB 0/1), which
	// is exactly the central switch this layer exists without. Splitting on
	// the subject's own median means "short rest" is short for him, in any
	// sport, including ones not added yet.
	medianRestDays: number
	shortRest: StatContextSplit | null
	longRest: StatContextSplit | null
}

export type StatContextOpponentAllowed = {
	teamId: string
	games: number
	meanAllowed: number
	// Which positions the number was filtered to, empty when unfiltered.
	// Surfaced because "what CIN allows" and "what CIN allows to catchers" are
	// different claims and the card has to say which one it made.
	positions: string[]
}

export type StatContextShare = {
	playerTotal: number
	teamTotal: number
	sharePct: number
	games: number
}

// One side's cards. A question with a single subject has one of these; a
// head-to-head has two, in the order its options are listed, so the page can
// put them side by side and compare like with like.
export type StatContextSubject = {
	label: string
	playerId: string | null
	teamId: string | null
	recentGames: StatContextGame[]
	seasonToDate: StatContextSplit | null
	home: StatContextSplit | null
	away: StatContextSplit | null
	rest: StatContextRest | null
	opponentAllowed: StatContextOpponentAllowed | null
	teamShare: StatContextShare | null
}

export type StatContext = {
	statLabel: string
	lastN: number
	subjects: StatContextSubject[]
}
