// questions.generationKey: "<league>:<gameId>:<template>" followed by
// whatever tells one question from another under the same template - a team
// id, a player id, or both players of a head-to-head. The unique index on it
// is what keeps a sync job's reruns from posting a question twice.
//
// A template's "slot" is the key up to what can change: "<league>:<gameId>:
// <template>", plus the team for a per-team template. A slot holds one live
// question, whichever player it ended up being about.

export function generationKey(parts: string[]): string {
	return parts.join(":")
}

export type ParsedGenerationKey = {
	leagueSlug: string
	gameId: string
	templateId: string
	rest: string[]
}

export function parseGenerationKey(key: string): ParsedGenerationKey | null {
	const [leagueSlug, gameId, templateId, ...rest] = key.split(":")
	if (!leagueSlug || !gameId || !templateId) return null
	return { leagueSlug, gameId, templateId, rest }
}

export function isInSlot(key: string, slot: string): boolean {
	return key === slot || key.startsWith(`${slot}:`)
}
