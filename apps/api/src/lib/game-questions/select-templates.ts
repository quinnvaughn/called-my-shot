// Which of a league's catalog templates go up on one game. Team templates
// always do; player templates are a random few, chosen the same way on every
// run for the same game so a rerun never swaps one for another.

type SelectableTemplate = { id: string; shape: string; group?: string }

// The same sequence in [0, 1) for the same seed: an FNV-1a hash of the seed
// feeding mulberry32.
export function seededRandom(seed: string): () => number {
	let hash = 0x811c9dc5
	for (let i = 0; i < seed.length; i++) {
		hash ^= seed.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	let state = hash >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export function shuffled<T>(items: T[], random: () => number): T[] {
	const result = [...items]
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1))
		const swap = result[i] as T
		result[i] = result[j] as T
		result[j] = swap
	}
	return result
}

const isTeamTemplate = (template: SelectableTemplate) =>
	template.shape === "team_stat_numeric_guess" ||
	template.shape === "team_stat_over_under"

// Every team template, every template already holding a live question on the
// game, then player templates in the game's shuffled order until there are
// perGame of them, at most one per group. The whole player list is shuffled
// every time, not just what's left, so a template chosen on an earlier run is
// still chosen once others on the game have gone live. Returned in catalog
// order.
export function selectGameTemplates<T extends SelectableTemplate>(
	templates: T[],
	{
		gameId,
		perGame,
		liveTemplateIds,
	}: { gameId: string; perGame: number; liveTemplateIds: Set<string> },
): T[] {
	const chosen = new Set<string>()
	const takenGroups = new Set<string>()
	let playerCount = 0
	const take = (template: T) => {
		chosen.add(template.id)
		if (template.group) takenGroups.add(template.group)
		if (!isTeamTemplate(template)) playerCount++
	}

	for (const template of templates) {
		if (isTeamTemplate(template) || liveTemplateIds.has(template.id)) {
			take(template)
		}
	}

	const players = templates.filter((template) => !isTeamTemplate(template))
	for (const template of shuffled(players, seededRandom(gameId))) {
		if (playerCount >= perGame) break
		if (chosen.has(template.id)) continue
		if (template.group && takenGroups.has(template.group)) continue
		take(template)
	}

	return templates.filter((template) => chosen.has(template.id))
}
