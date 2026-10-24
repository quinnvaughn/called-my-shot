import type { SeasonOutcome } from "#/components/arcade/name-that-season/season-result"
import { LANDING_CAST } from "../group-call-demo/demo-fixture"

// The made-up group's day on the landing page: who played each arcade game
// and how it went. The call and the presser come from the group call demo's
// fixture, so the call's points are still the real scoring functions' answer.

const [sam, mike, priya, dave] = LANDING_CAST.names

export type GroupDaySeasonRow = {
	name: string
	isYou: boolean
	outcomes: SeasonOutcome[]
}

export type GroupDayRankRow = {
	name: string
	isYou: boolean
	// Whether each slot was right, top first.
	slots: boolean[]
}

export const GROUP_DAY_SEASON: GroupDaySeasonRow[] = [
	{ name: priya, isYou: false, outcomes: ["CLOSE", "HIT"] },
	{ name: "You", isYou: true, outcomes: ["MISS", "CLOSE", "CLOSE", "HIT"] },
	{
		name: dave,
		isYou: false,
		outcomes: ["MISS", "MISS", "CLOSE", "MISS", "CLOSE", "MISS"],
	},
]

export const GROUP_DAY_RANK: GroupDayRankRow[] = [
	{ name: mike, isYou: false, slots: [true, true, true, true, true] },
	{ name: "You", isYou: true, slots: [true, false, true, true, false] },
	{ name: sam, isYou: false, slots: [false, true, false, false, true] },
]
