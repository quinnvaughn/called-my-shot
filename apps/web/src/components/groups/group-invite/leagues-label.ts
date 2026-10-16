import type { GroupPreview } from "./types"

// The leagues a group counts, for the line under its name. An empty list
// means every league.
export function leaguesLabel(trackedLeagues: GroupPreview["trackedLeagues"]) {
	return trackedLeagues.length === 0
		? "all leagues"
		: trackedLeagues
				.map((league) => league.abbreviation)
				.sort()
				.join(", ")
}
