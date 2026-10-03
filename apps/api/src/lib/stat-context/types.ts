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
	"usage",
	"workload",
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

// Which column carries the volume behind a stat, and what to call it. Targets
// are the opportunity behind receiving yards, carries the one behind rushing
// yards, and neither is the stat the question asks about - so the label
// travels with the numbers rather than being inferred downstream.
export type UsageStat = {
	label: string
	statKeys: readonly string[]
}

// The volume a subject is being handed, per game and as a share of what their
// own team hands out. Separate from StatContextShare because it is measured in
// a different column from the question's stat: a receiving yards card showing
// 28% means 28% of the team's targets, and saying so is the whole point.
export type StatContextUsage = {
	label: string
	games: number
	perGame: number
	sharePct: number
}

// Which column measures how much of a game a subject is out there for, and
// what to call it. Pitches behind a pitcher's strikeouts: the count he gets to
// is capped by how long he's left in, and an opener and a starter on the same
// card are not doing the same job.
export type WorkloadStat = {
	label: string
	statKeys: readonly string[]
}

// How much work the subject gets per appearance, over this season. Per
// appearance because that is what the headline's average is built from.
export type StatContextWorkload = {
	label: string
	games: number
	perGame: number
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
	usage: StatContextUsage | null
	workload: StatContextWorkload | null
}

// One candidate in a "who leads this game" pool, with what they're averaging.
// A leader question's pool is every player on both teams, so the useful view
// was never a game log each - it's who is actually in front.
export type StatContextRankedPlayer = {
	playerId: string
	label: string
	mean: number
	games: number
	// The side this candidate is up against in this game, which is not the same
	// for every row: half the pool faces one defense and half the other, and
	// which one is most of why a name further down the list is worth a look.
	// Null when the candidate is on neither competitor, which a pool shouldn't
	// contain but which the ranking has no way to rule out on its own.
	opponentTeamId: string | null
	isHome: boolean
}

// What one side of the game has been giving up in the pooled stat, per game.
// A leader question has no single subject to hang an opponentAllowed card on,
// so the generosity is stated per team and each ranking row names which of
// the two it is facing.
//
// Unfiltered by position on purpose. A leader pool is mixed - a receiving
// yards pool holds receivers, tight ends and backs - so a per-candidate
// position filter would print a different denominator on every row, each on a
// thinner sample, to answer a question the pool isn't asking. What a caller
// wants here is which side of this game is the soft one.
export type StatContextPoolDefense = {
	teamId: string
	games: number
	meanAllowed: number
}

// A tie is a real outcome in the NFL and stays one rather than folding into a
// loss, which would misstate both the record and the streak.
export type StatContextOutcome = "win" | "loss" | "tie"

// One completed game, as a results strip reads it: who, where, and what the
// scoreboard said. Deliberately not StatContextGame - that one is a player's
// line in a box score and carries a stat value, where this one has no stat in
// it at all, because the question it serves is about the result and nothing
// else.
export type StatContextResult = {
	gameId: string
	date: Date
	opponentTeamId: string
	// Carried on the row rather than looked up on the page. A player's game log
	// names an opponent the page already knows, because every one of those
	// games was against one of this game's two teams from the subject's point
	// of view. A team's own schedule is not: last week they played someone
	// else's team entirely, and the page has no way to name it.
	opponentAbbreviation: string
	isHome: boolean
	pointsFor: number
	pointsAgainst: number
	outcome: StatContextOutcome
}

// The gap between what a team scores and what it gives up, in whatever terms
// its own sport states that in. `kind` is not decoration - a net rating is a
// rate per 100 possessions and a run differential is a season total, so the
// page needs to know which measurement it was handed before it can name or
// format it. See lib/stat-context/differential.ts for the mapping.
export type StatContextDifferential = {
	kind:
		| "net_rating"
		| "run_differential"
		| "point_differential"
		| "goal_differential"
	value: number
	// Games behind the figure, so a page can say what it is measured over.
	games: number
}

// A record over some set of completed games, with the scoring behind it.
// `games` is always wins + losses + ties, so nothing downstream has to add
// them up to know the sample it is looking at.
export type StatContextRecord = {
	games: number
	wins: number
	losses: number
	ties: number
	pointsForPerGame: number
	pointsAgainstPerGame: number
	// How many of those games' combined totals cleared the question's line,
	// when it has one. Null for a question with no line to clear, which is
	// every who-wins question.
	//
	// Derived here and not taken from ESPN because no standings row can answer
	// it: it is a count against this question's own line.
	overLine: number | null
}

// A won-lost record with nothing else attached, which is all a standings split
// carries - ESPN publishes a team's home and road records but not the scoring
// behind either. otLosses is the NHL's overtime-loss count where ESPN's own
// split supplies it, and null otherwise: a record counted off this app's game
// rows can't tell an overtime loss from any other, so it counts it a loss.
// `games` includes them.
export type StatContextSplitRecord = {
	games: number
	wins: number
	losses: number
	ties: number
	otLosses: number | null
}

// A run of the same outcome ending at the most recent completed game.
export type StatContextStreak = {
	outcome: StatContextOutcome
	length: number
}

// One side of a matchup. Everything on it is over completed regular-season
// games strictly before the question's lock time, with the game being asked
// about left out - the same pregame guarantee every box-score query makes.
export type StatContextMatchupSide = {
	label: string
	teamId: string
	isHome: boolean
	// The sport's own scoring-gap figure, from the last standings reading taken
	// before this question locked. Null when the league has no mapped metric,
	// when no reading predates the lock, or - for a net rating - when that
	// reading carried no possession count.
	differential: StatContextDifferential | null
	// Null only when this side has no completed game yet, which takes the whole
	// matchup down with it - see buildMatchup.
	overall: StatContextRecord | null
	// The record on the side of the scoreboard this team is on in this game:
	// home games for the home team, road games for the visitor. Asymmetric on
	// purpose. Those are the two numbers that bear on the game being asked
	// about, where both halves of both teams' splits is four numbers to find
	// the two in.
	inThisRole: StatContextSplitRecord | null
	// This side's record against the other one this season. Over every meeting,
	// not just the handful listed below the columns - two division rivals can
	// play thirteen times, and a reader should not have to count a truncated
	// list to learn who has had the better of it.
	headToHead: StatContextSplitRecord | null
	// The last ten, as a record. Set only when ten games actually stand behind
	// it - a team two weeks into a season has a recent run, not a last ten, and
	// labelling two games that way overstates what was measured.
	lastTen: StatContextSplitRecord | null
	streak: StatContextStreak | null
	// Most recent first, capped at the context's lastN.
	recentResults: StatContextResult[]
	// Days between this team's last completed game and this one's start,
	// rounded to whole days: a 1pm Sunday into an 8:20pm Sunday is 7 days of
	// rest, not 7.3, and no league's short-week distinction turns on hours.
	// Null when they have no completed game before it.
	restDays: number | null
}

// A prior meeting between these same two teams.
export type StatContextMeeting = {
	gameId: string
	date: Date
	// The home side of THAT game, which need not be the home side of this one.
	homeTeamId: string
	awayTeamId: string
	homeScore: number
	awayScore: number
	// Null on a tie, which is a result and not a missing one.
	winnerTeamId: string | null
}

// The game itself rather than either side's stat line, which is what a
// who-wins or game-total question actually asks about.
export type StatContextMatchup = {
	// Which number leads each column. A who-wins question leads with the
	// record, a game total with scoring. The same rows are behind both, so the
	// payload alone can't say which question was asked.
	focus: "winner" | "scoring"
	// In the order the question lists its two sides, which is the order the
	// pick form shows them, so the columns line up with the buttons. Which one
	// is at home is on the side itself, not in the ordering.
	sides: [StatContextMatchupSide, StatContextMatchupSide]
	// Most recent first, this season only. Empty is the normal case in a league
	// whose teams meet once or twice a year.
	meetings: StatContextMeeting[]
}

export type StatContext = {
	statLabel: string
	lastN: number
	// One entry for a one-sided question, two for a head-to-head. Empty for a
	// pool question, which uses ranking instead.
	subjects: StatContextSubject[]
	// Populated only for a pool question. Ordered best first.
	ranking: StatContextRankedPlayer[]
	// The two sides' defenses, home first. Populated alongside a ranking, and
	// only for a stat whose recipe says the other side's generosity is part of
	// its story - see recipes.ts.
	defenses: StatContextPoolDefense[]
	// Populated instead of either of the above for a game-level question, which
	// has no per-subject stat to log.
	matchup: StatContextMatchup | null
	// A head-to-head whose two sides' workloads are too far apart to compare
	// like with like - see lib/workload.ts. False whenever either side has no
	// workload figure, and on every question that isn't a head-to-head.
	workloadMismatch: boolean
}
