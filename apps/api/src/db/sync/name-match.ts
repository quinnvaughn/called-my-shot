// Matches ESPN's players against another source's roster by name, for the
// lookups ESPN has no id bridge to (MLB rookie eligibility, league CDN
// headshots).

// ESPN writes names without diacritics ("Ronald Acuna Jr.") where the leagues
// keep them ("Ronald Acuña Jr."), so a raw string compare drops a few dozen
// players per league. Punctuation and hyphen/space differences are folded for
// the same reason. Team names go through it too: the NHL spells
// "Montréal Canadiens" where ESPN doesn't.
export function normalizeName(name: string): string {
	return name
		.normalize("NFD")
		.replace(/\p{Mn}/gu, "")
		.toLowerCase()
		.replace(/[.,']/g, "")
		.replace(/[-\s]+/g, " ")
		.trim()
}

export type NameIndex<T> = {
	// Normalized team name -> that team's roster, by normalized player name.
	byTeam: Map<string, Map<string, T>>
	// Every rostered player in the league, by normalized name, for the case
	// where ESPN still lists someone on the team he was traded off of. A name
	// held by more than one player maps to null rather than to a coin flip -
	// the wrong Luis Garcia would be worse than no match at all.
	byName: Map<string, T | null>
	// Normalized team name -> that team's roster by first initial and last
	// name ("s montembeault"), the last resort for a nickname on one side and
	// a given name on the other (ESPN's "Sam Montembeault" is the NHL's
	// "Samuel"). Only within a team, and null when two teammates share it.
	byTeamInitial: Map<string, Map<string, T | null>>
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"])

// "Bobby Portis Jr." -> "b portis". Null for a one-word name.
function initialKey(normalized: string): string | null {
	const words = normalized.split(" ")
	while (words.length > 2 && SUFFIXES.has(words[words.length - 1] ?? ""))
		words.pop()
	const first = words[0]
	const last = words[words.length - 1]
	return words.length > 1 && first && last ? `${first[0]} ${last}` : null
}

export function buildNameIndex<T>(
	entries: { team: string; name: string; value: T }[],
): NameIndex<T> {
	const byTeam = new Map<string, Map<string, T>>()
	const byName = new Map<string, T | null>()
	const byTeamInitial = new Map<string, Map<string, T | null>>()
	for (const { team, name, value } of entries) {
		const teamKey = normalizeName(team)
		const key = normalizeName(name)
		const roster = byTeam.get(teamKey) ?? new Map<string, T>()
		roster.set(key, value)
		byTeam.set(teamKey, roster)
		byName.set(key, byName.has(key) ? null : value)
		const initial = initialKey(key)
		if (initial) {
			const initials = byTeamInitial.get(teamKey) ?? new Map<string, T | null>()
			initials.set(initial, initials.has(initial) ? null : value)
			byTeamInitial.set(teamKey, initials)
		}
	}
	return { byTeam, byName, byTeamInitial }
}

// The player's own team is tried first so a shared name resolves to the right
// man whenever ESPN and the other source agree on where he plays.
export function findByName<T>(
	index: NameIndex<T>,
	name: string,
	team: string,
): T | null {
	const teamKey = normalizeName(team)
	const key = normalizeName(name)
	const initial = initialKey(key)
	return (
		index.byTeam.get(teamKey)?.get(key) ??
		index.byName.get(key) ??
		(initial ? index.byTeamInitial.get(teamKey)?.get(initial) : null) ??
		null
	)
}
