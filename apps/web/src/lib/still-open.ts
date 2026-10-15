import { formatGuess } from "./field-signal"

type Side = { label: string; count: number }

// Where the group landed on an open question, in the form its shape reads
// best in at rail width: two sides as a bar, more as the leader alone (six
// segments don't read in a row that narrow), a numeric guess as the middle
// of the members' guesses.
export type GroupSplit =
	| { kind: "sides"; first: Side; second: Side }
	| { kind: "leader"; text: string }
	| { kind: "median"; text: string }

export function groupSplit(entry: {
	memberCount: number
	picks: readonly { optionId: string; count: number }[]
	medianGuess: number | null
	options: readonly { id: string; label: string }[]
	rateStat: boolean
}): GroupSplit | null {
	if (entry.medianGuess !== null) {
		return {
			kind: "median",
			text: `Group median ${formatGuess(entry.medianGuess, entry.rateStat)}`,
		}
	}
	const countFor = (optionId: string) =>
		entry.picks.find((p) => p.optionId === optionId)?.count ?? 0

	const [a, b] = entry.options
	if (entry.options.length === 2 && a && b) {
		return {
			kind: "sides",
			first: { label: a.label, count: countFor(a.id) },
			second: { label: b.label, count: countFor(b.id) },
		}
	}

	// picks arrive most picked first.
	const [top, next] = entry.picks
	if (!top) return null
	if (next && next.count === top.count) {
		return { kind: "leader", text: `Tied at the top · ${top.count} each` }
	}
	const label = entry.options.find((o) => o.id === top.optionId)?.label
	if (!label) return null
	return {
		kind: "leader",
		text: `${label} leads · ${top.count} of ${entry.memberCount}`,
	}
}

// "Locks in 40m", "Locks in 5h". The list only holds the next 48 hours, so
// hours are as coarse as it gets.
export function locksInLabel(locksAt: string, now: number = Date.now()): string {
	const minutes = Math.max(1, Math.round((Date.parse(locksAt) - now) / 60_000))
	if (minutes < 60) return `Locks in ${minutes}m`
	return `Locks in ${Math.floor(minutes / 60)}h`
}
