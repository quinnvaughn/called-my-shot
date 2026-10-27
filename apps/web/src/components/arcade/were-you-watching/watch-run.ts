import type { WatchPlay_PlayFragment } from "#/graphql/generated/graphql"

export type WatchServed = NonNullable<WatchPlay_PlayFragment["current"]>
export type WatchAnswered = WatchPlay_PlayFragment["answered"][number]

// One run through a quiz as the game draws it, whether the server keeps it
// (signed in) or the browser does (signed out).
export type WatchRunView = {
	status: "not_started" | "open" | "between" | "done"
	// The question on the clock, with when its clock runs out on this
	// device.
	current: (WatchServed & { deadline: number }) | null
	answered: WatchAnswered[]
	correct: number
	total: number
	totalMs: number
	clean: boolean
	// Place on the quiz's board. Null signed out.
	rank: number | null
}

export type WatchRun = {
	view: WatchRunView
	pending: boolean
	error: string | null
	start: () => void
	answer: (choice: number | null) => void
	next: () => void
	// The page went hidden while a question was up.
	markHidden: () => void
}
