import type { StarterRole } from "../../db/sync/starters-parse"

// Which starter a generated player question is about, chosen per team.
export type StarterPick = {
	role: StarterRole
	// Depth chart position abbreviations ("QB", "RB") the player can come
	// from. Unset takes anyone listed in the role.
	positions?: string[]
	// "category.stat" in ESPN's season statistics that candidates are ranked
	// by, highest per game first, and that an over/under's line is set from.
	espnStat: string
	// The games count that per-game figure divides by, when it isn't the stat
	// category's own gamesPlayed.
	espnGames?: string
	// How many games of last season's average count until this season has
	// that many of its own - see blendSamples in ./lines.
	priorWeight: number
}

export type StarterCandidate = {
	playerId: string
	teamId: string
	role: StarterRole
	position: string | null
	sortOrder: number
	injuryStatus: string | null
}

// ESPN depth chart designations a player still takes the field under. Any
// other ("Out", "Doubtful", "Injured Reserve", "Suspension"), including one
// not listed here, keeps the player from being picked: a question about
// someone who doesn't play only ends up voided.
const PLAYABLE_INJURY_STATUSES = new Set([
	"Questionable",
	"Probable",
	"Day-To-Day",
])

export function isPlayable(injuryStatus: string | null): boolean {
	return injuryStatus === null || PLAYABLE_INJURY_STATUSES.has(injuryStatus)
}

// A team's starters the pick can come from, in depth chart order.
export function eligibleStarters(
	starters: StarterCandidate[],
	teamId: string,
	pick: Pick<StarterPick, "role" | "positions">,
): StarterCandidate[] {
	return starters
		.filter(
			(starter) =>
				starter.teamId === teamId &&
				starter.role === pick.role &&
				(!pick.positions ||
					(starter.position !== null &&
						pick.positions.includes(starter.position))) &&
				isPlayable(starter.injuryStatus),
		)
		.sort((a, b) => a.sortOrder - b.sortOrder)
}

// Whether ESPN lists anyone for this team in the role. Until it does, no
// player can be ruled out of it.
export function startersPosted(
	starters: StarterCandidate[],
	teamId: string,
	role: StarterRole,
): boolean {
	return starters.some(
		(starter) => starter.teamId === teamId && starter.role === role,
	)
}

// Highest per-game average first. A candidate with no average keeps its depth
// chart place behind everyone who has one.
export function rankCandidates(
	candidates: StarterCandidate[],
	perGame: (candidate: StarterCandidate) => number | null,
): StarterCandidate[] {
	return candidates
		.map((candidate, index) => ({
			candidate,
			index,
			value: perGame(candidate),
		}))
		.sort((a, b) => {
			if (a.value === null || b.value === null) {
				if (a.value === b.value) return a.index - b.index
				return a.value === null ? 1 : -1
			}
			return b.value - a.value || a.index - b.index
		})
		.map(({ candidate }) => candidate)
}
