import {
	BASE_POINTS_BY_SHAPE,
	selectionPoints,
	sidePrice,
} from "@called-my-shot/scoring"

// The made-up group and game the landing page's demo plays out. The points
// come from the real scoring functions, so the result it shows is what the
// app would actually award for this call.

export const DEMO_GROUP = { name: "Sunday Scaries", memberCount: 9 }

export const DEMO_MATCHUP = "Bills at Chiefs"

// The model's chance the Bills win, which prices both sides.
const BILLS_HIT_RATE = 0.36

export const DEMO_CONVICTION = 80
const SAM_CONVICTION = 45

export const DEMO_SIDES = [
	{
		id: "bills",
		label: "Bills",
		abbreviation: "BUF",
		fieldPct: 36,
		final: 27,
		groupmates: ["Sam"],
	},
	{
		id: "chiefs",
		label: "Chiefs",
		abbreviation: "KC",
		fieldPct: 64,
		final: 24,
		groupmates: ["Mike", "Priya", "Dave", "Jordan", "Alex", "Chris"],
	},
] as const

export const DEMO_PICK_ID = "bills"

function billsHitPoints(conviction: number): number {
	const price = sidePrice(BILLS_HIT_RATE)
	return selectionPoints(
		BASE_POINTS_BY_SHAPE.team_vs_team,
		price.lossRate,
		36,
		2,
		conviction,
		true,
		1,
		{ modelHitRate: BILLS_HIT_RATE, winMult: price.winMult },
	)
}

export const DEMO_POINTS = billsHitPoints(DEMO_CONVICTION)

export type DemoBoardEntry = {
	username: string
	isYou: boolean
	points: number
	// Places gained on this game; 0 for no change.
	moved: number
}

// Season points before this game. Only the two who took the Bills move.
const BEFORE = [
	{ username: "@mike", points: 2140, gained: 0 },
	{ username: "@priya", points: 1875, gained: 0 },
	{ username: "@sam", points: 1860, gained: billsHitPoints(SAM_CONVICTION) },
	{ username: "You", points: 1820, gained: DEMO_POINTS },
]

function ranked(points: (entry: (typeof BEFORE)[number]) => number) {
	return [...BEFORE].sort((a, b) => points(b) - points(a))
}

const beforeOrder = ranked((e) => e.points)
const afterOrder = ranked((e) => e.points + e.gained)

// The top of the group's board once the game is final.
export const DEMO_BOARD: DemoBoardEntry[] = afterOrder
	.slice(0, 3)
	.map((entry, index) => ({
		username: entry.username,
		isYou: entry.username === "You",
		points: entry.points + entry.gained,
		moved: beforeOrder.indexOf(entry) - index,
	}))

export const DEMO_PRESSER = {
	from: "@mike",
	question: `${DEMO_CONVICTION} on the Bills. Who told you?`,
}
