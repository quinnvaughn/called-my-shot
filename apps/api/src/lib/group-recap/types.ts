import type { StreakFamily } from "@called-my-shot/scoring"

// What group_recaps.data holds: one group's week, frozen when the recap is
// made. Everything here is ids and numbers. Names, question titles and pick
// labels are read at render time (see ./view.ts), so a renamed user or an
// edited title shows as it is now rather than as it was.
//
// Each slot keeps a short ranked list of candidates rather than one winner,
// because who can be shown is decided at read time: a member who opts out of
// recaps, or leaves the group, gives their slot to the next candidate, and
// an admin hiding the worst miss hides it on recaps already posted.

export type RecapCall = {
	userId: string
	callId: string
	questionId: string
	leagueId: string
	points: number
}

export type RecapMoment =
	| {
			kind: "sweep"
			userId: string
			leagueId: string
			slateKey: string
			gameCount: number
	  }
	// A final game with every official question called right (perfect_card,
	// count is the wins) or every one wrong (oh_fer, count is the losses).
	// See gameEntryVerdict.
	| {
			kind: "perfect_card" | "oh_fer"
			userId: string
			leagueId: string
			gameId: string
			count: number
	  }
	// A redo off a pick that would have hit, onto one that missed.
	| ({ kind: "redo_backfired" } & RecapCall)
	// The one member who got it right, with at least two others wrong.
	| ({ kind: "lone_correct"; callerCount: number } & RecapCall)
	// Most of the group on the same wrong pick. Names nobody.
	| {
			kind: "consensus_miss"
			questionId: string
			leagueId: string
			optionId: string
			wrongCount: number
			callerCount: number
	  }
	// A redo off a pick that would have missed, onto one that hit.
	| ({ kind: "redo_paid_off" } & RecapCall)
	| {
			kind: "streak_ended"
			userId: string
			leagueId: string
			family: StreakFamily
			length: number
	  }
	// userId is the fader. Both sides are members.
	| ({ kind: "fade_hit"; targetUserId: string } & RecapCall)
	| ({ kind: "called_early"; daysAhead: number } & RecapCall)
	| {
			kind: "longest_streak"
			userId: string
			leagueId: string
			family: StreakFamily
			length: number
	  }

export type RecapMomentKind = RecapMoment["kind"]

export type RecapStanding = { userId: string; rank: number }

// A member's week: their settled calls' points plus any streak or sweep
// bonus dated inside it, the same total the season board adds.
export type RecapPlayerOfTheWeek = {
	userId: string
	points: number
	wins: number
	losses: number
}

// A member whose rank on the season board changed since the previous recap.
// Positive delta is a climb.
export type RecapMover = { userId: string; from: number; to: number }

export type GroupRecapData = {
	// Every member's settled calls in the week, opted out or not: the totals
	// name nobody.
	record: {
		wins: number
		losses: number
		activeMembers: number
	}
	// Whoever had the most points among members with
	// PLAYER_OF_THE_WEEK_MIN_CALLS settled calls, when that's above zero.
	// Several on an exact tie, empty when nobody qualified. Every member is a
	// candidate: unlike the other slots, a winner hidden at read time leaves
	// the slot empty rather than handing it to whoever came second. Absent
	// from a recap saved before the slot existed, which reads as nobody.
	playersOfTheWeek?: RecapPlayerOfTheWeek[]
	bestCalls: RecapCall[]
	worstMisses: RecapCall[]
	// Up to a few candidates per kind, best first within each kind. Which
	// kinds show, and in what order, is ./view.ts's decision.
	moments: RecapMoment[]
	// The group's season board when the recap was made. The next recap's
	// movers are read against this.
	standings: RecapStanding[]
	// Empty on a group's first recap, which has nothing to compare with.
	movers: RecapMover[]
}
