import type { CallGifState } from "@called-my-shot/gifs"
import type {
	ImagePlayer,
	ImageTeam,
} from "#/components/ui/player-or-team-image"
import type { QuestionStatus } from "#/graphql/generated/graphql"

export type CallRecordCardData = {
	name: string
	username: string
	avatarUrl: string | null
	// Already formatted for display (e.g. "Minnesota Timberwolves", "Over
	// 47.5", "62") - see pickSummary in lib/call-summary.ts, which already
	// handles every question type's own formatting rules.
	pickLabel: string
	// The player or team a single pick is, shown beside pickLabel. Null for a
	// pick that is neither (Over, a numeric guess) and for a multi-pick call.
	pickSubject?: {
		player?: ImagePlayer | null
		team?: ImageTeam | null
	} | null
	// Award calls with more than one pick: each name, and once the question
	// resolves whether it hit. The card lists these in place of pickLabel so
	// every pick is marked on its own. Null on every other call.
	picks:
		| {
				label: string
				hit: boolean | null
				player?: ImagePlayer | null
				team?: ImageTeam | null
		  }[]
		| null
	// When the call was made, as an ISO timestamp (see CallTimestamp). The
	// point of a record is when it was set, so this is never optional.
	calledAt: string
	// Null on all three until the question resolves - a call with no outcome
	// is still a record, it just doesn't have a result to state yet.
	isWin: boolean | null
	points: number | null
	// While unsettled, what the call pays if right and costs if wrong,
	// already formatted ("+107", "+80–120" for a numeric guess's range;
	// "−102"). Null once settled, and for a multi-pick award call.
	inTheAir: { win: string; lose: string } | null
	// Which reaction pool the card draws from. The state, not a chosen gif:
	// the pick happens on mount inside ReactionGif, so whoever renders the card
	// has nothing to decide - see callGifState in lib/call-gif.ts.
	gifState: CallGifState
	questionStatus: QuestionStatus
	// What to say in place of the result while it's pending: "Locks Jun 12,
	// 2027" or "Awaiting result".
	pendingLabel: string | null
	// % of the field that also picked this - null for numeric guesses (too
	// specific for anyone to share) and for
	// player_season_award/team_season_award (no single number describes
	// several independent picks at once).
	fieldPct: number | null
	// Numeric guesses only, once the actual value is in. An exact guess is its
	// own kind, since "Off by 0" reads as still being off, and gets its own
	// face. `by` is already formatted (see formatGuess).
	closeness: { kind: "exact" } | { kind: "off"; by: string } | null
	// Replaces the verdict word ("Called it" / "Missed") when this call's
	// margin was remarkable in either direction - see callMargin in
	// @called-my-shot/scoring. Null on the ordinary call, which is most of
	// them, and the eyebrow reads as it always has.
	marginLabel: string | null
	// How far the call landed from its line, already formatted. Set on every
	// shape with two numbers to subtract, not just the numeric guesses
	// `closeness` covers, and set whether or not the margin earned a label:
	// the distance is worth stating even when its size isn't remarkable.
	offBy: string | null
	// What actually happened, already formatted - "63", "Ja'Marr Chase: 118".
	// The pick and the points say whether the call landed; without this the
	// card never says what it landed against. Null on a question with no
	// number behind it (Yes/No, an award) and on one resolved by hand.
	actual: string | null
	conviction: number
	caseText: string | null
	// Set on a win at least STREAK_TAG_MIN into its league-and-family streak.
	streakLength: number | null
}
