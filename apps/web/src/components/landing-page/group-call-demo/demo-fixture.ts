import {
	BASE_POINTS_BY_SHAPE,
	selectionPoints,
	sidePrice,
} from "@called-my-shot/scoring"

// The game the demo plays out and the group it plays out in. The points come
// from the real scoring functions, so the result it shows is what the app
// would actually award for this call. The group is made up on the landing
// page and a real one on its invite page (see DemoCast).

export const DEMO_MATCHUP = "Bills at Chiefs"
export const DEMO_CONVICTION = 80

// The model's chance the Bills win, which prices both sides.
const BILLS_HIT_RATE = 0.36
const BILLS_FIELD_PCT = 36
const ALLY_CONVICTION = 45

// Who the demo is about. `names` are the groupmates in it: the first takes
// the Bills alongside the viewer, the rest take the Chiefs, and the second
// leads the board and asks the presser question.
export type DemoCast = {
	groupName: string
	groupLogoUrl?: string | null
	// Under the group's name in the demo's header.
	groupMeta: string
	names: string[]
}

// Fewer than this many groupmates can't fill the demo's parts.
export const DEMO_MIN_NAMES = 4

export const LANDING_CAST: DemoCast = {
	groupName: "Sunday Scaries",
	groupMeta: "9 members",
	names: ["Sam", "Mike", "Priya", "Dave", "Jordan", "Alex", "Chris"],
}

export type DemoBoardEntry = {
	name: string
	isYou: boolean
	points: number
	// Places gained on this game; 0 for no change.
	moved: number
}

export type DemoSideData = {
	id: string
	label: string
	fieldPct: number
	final: number
	groupmates: string[]
	isPick: boolean
}

export type Demo = {
	cast: DemoCast
	sides: DemoSideData[]
	ally: string
	points: number
	board: DemoBoardEntry[]
	presser: { from: string; question: string }
}

function billsHitPoints(conviction: number): number {
	const price = sidePrice(BILLS_HIT_RATE)
	return selectionPoints(
		BASE_POINTS_BY_SHAPE.team_vs_team,
		price.lossRate,
		BILLS_FIELD_PCT,
		2,
		conviction,
		true,
		1,
		{ modelHitRate: BILLS_HIT_RATE, winMult: price.winMult },
	)
}

export function buildDemo(cast: DemoCast): Demo {
	const [ally, leader, third, ...rest] = cast.names
	const points = billsHitPoints(DEMO_CONVICTION)

	// Season points before this game. Only the two who took the Bills move.
	const before = [
		{ name: leader, points: 2140, gained: 0, isYou: false },
		{ name: third, points: 1875, gained: 0, isYou: false },
		{
			name: ally,
			points: 1860,
			gained: billsHitPoints(ALLY_CONVICTION),
			isYou: false,
		},
		{ name: "You", points: 1820, gained: points, isYou: true },
	]
	const beforeOrder = [...before].sort((a, b) => b.points - a.points)
	const afterOrder = [...before].sort(
		(a, b) => b.points + b.gained - (a.points + a.gained),
	)

	return {
		cast,
		sides: [
			{
				id: "bills",
				label: "Bills",
				fieldPct: BILLS_FIELD_PCT,
				final: 27,
				groupmates: [ally],
				isPick: true,
			},
			{
				id: "chiefs",
				label: "Chiefs",
				fieldPct: 100 - BILLS_FIELD_PCT,
				final: 24,
				groupmates: [leader, third, ...rest],
				isPick: false,
			},
		],
		ally,
		points,
		// The top of the group's board once the game is final.
		board: afterOrder.slice(0, 3).map((entry, index) => ({
			name: entry.name,
			isYou: entry.isYou,
			points: entry.points + entry.gained,
			moved: beforeOrder.indexOf(entry) - index,
		})),
		presser: {
			from: leader,
			question: `${DEMO_CONVICTION} on the Bills. Who told you?`,
		},
	}
}
