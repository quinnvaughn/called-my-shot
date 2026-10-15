import { z } from "zod"

// Where one user's filled-out ballot lives. There's no entry id: the ballot
// slug and the username are the whole address.
export function ballotEntryPath(ballotSlug: string, username: string): string {
	return `/ballots/${ballotSlug}/${username}`
}

// A win-totals ballot can be read as projected standings as well as a list
// of picks. The ballot page is where picks get made, so it opens on its
// questions and ?view=standings switches. An entry page is someone's ballot
// to look at, so it opens on standings and ?view=picks switches. Any other
// ballot has only the list, and ignores the param.
//
// An entry page opened from a group's ballot board also carries ?group=, so
// its breadcrumb leads back to that board.
export const ballotPageSearchSchema = z.object({
	view: z.literal("standings").optional().catch(undefined),
})

export const ballotEntrySearchSchema = z.object({
	view: z.literal("picks").optional().catch(undefined),
	group: z.string().optional().catch(undefined),
})

// A short fingerprint of every pick's number and tie order, for the entry
// page's card url version param.
export function picksVersion(
	members: {
		call: { guessValue?: number | null } | null
		tiebreakPosition?: number | null
	}[],
): string {
	let hash = 0
	for (const m of members) {
		const part = `${m.call?.guessValue ?? ""}:${m.tiebreakPosition ?? ""};`
		for (const char of part) {
			hash = (hash * 31 + char.charCodeAt(0)) >>> 0
		}
	}
	return hash.toString(36)
}
