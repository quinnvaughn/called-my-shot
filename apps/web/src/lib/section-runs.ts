export type SectionRun<T> = {
	section: string | null
	entries: { item: T; index: number }[]
}

// Consecutive items sharing a section (a division, on a win-totals ballot),
// each with its position in the full list. Runs, not a group-by: membership
// is one flat list in order, and a section that appears twice in it comes
// back twice, so the set's own order holds. A list with no sections at all
// comes back as one null-section run.
export function sectionRuns<T extends { section: string | null }>(
	items: T[],
): SectionRun<T>[] {
	const runs: SectionRun<T>[] = []
	items.forEach((item, index) => {
		const current = runs.at(-1)
		if (current && current.section === item.section)
			current.entries.push({ item, index })
		else runs.push({ section: item.section, entries: [{ item, index }] })
	})
	return runs
}
