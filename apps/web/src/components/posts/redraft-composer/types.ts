import type {
	ComposerRedraftQuery,
	RedraftPoolQuery,
} from "#/graphql/generated/graphql"

export type RedraftPoolEntry = RedraftPoolQuery["redraftPool"][number]

export type ComposerClass = NonNullable<ComposerRedraftQuery["redraftPrompt"]>

export type DraftSlotData = ComposerClass["slots"][number]

// "2004–2026", one year for a single season, or nothing for a draftee with
// no seasons on record.
export function careerYears(entry: {
	firstSeason: number | null
	lastSeason: number | null
}): string {
	if (entry.firstSeason === null || entry.lastSeason === null) return ""
	return entry.firstSeason === entry.lastSeason
		? `${entry.firstSeason}`
		: `${entry.firstSeason}–${entry.lastSeason}`
}

// Where a pool entry went in the draft: "#3", or "Undrafted".
export const draftedAt = (overall: number | null) =>
	overall === null ? "Undrafted" : `#${overall}`
