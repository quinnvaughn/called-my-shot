import type { StreakMode } from "@called-my-shot/scoring"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { type IdentityUser, toIdentity } from "#/lib/identity"
import { type StreakFamilyValue, streakFamilyParam } from "#/lib/streak-meta"

export const GroupStreakEntryFragment = graphql(`
	fragment GroupHighlights_streak on GroupStreakEntry {
		user {
			...Identity_user
		}
		league {
			id
			abbreviation
			slug
		}
		family
		familyLabel
		currentLength
		bestLength
		currentColdLength
		worstColdLength
	}
`)

export const GroupSweepEntryFragment = graphql(`
	fragment GroupHighlights_sweep on GroupSweepEntry {
		user {
			...Identity_user
		}
		league {
			id
			abbreviation
			slug
		}
		slateKey
		slateLabel
		gameCount
	}
`)

// The unwrapped rows the highlight list components take, so the band and the
// sheet can share them - same split as LeaderboardRowData and the two
// leaderboards that feed it.
export type StreakEntry = {
	user: IdentityUser
	league: { id: string; abbreviation: string; slug: string }
	family: StreakFamilyValue
	familyLabel: string
	currentLength: number
	bestLength: number
	currentColdLength: number
	worstColdLength: number
}

export type SweepEntry = {
	user: IdentityUser
	league: { id: string; abbreviation: string; slug: string }
	slateKey: string
	slateLabel: string
	gameCount: number
}

export function useStreakEntries(
	entries: readonly FragmentType<typeof GroupStreakEntryFragment>[],
): StreakEntry[] {
	return [...useFragment(GroupStreakEntryFragment, entries)]
}

export function useSweepEntries(
	entries: readonly FragmentType<typeof GroupSweepEntryFragment>[],
): SweepEntry[] {
	return [...useFragment(GroupSweepEntryFragment, entries)]
}

export const entryKey = (e: StreakEntry) =>
	`${toIdentity(e.user).id}-${e.league.id}-${e.family}`

// A hot row and a cold row can name the same track, so each says which side
// of it the reader just clicked on rather than letting the page guess.
export const streakTo = (e: StreakEntry, mode: StreakMode) =>
	({
		kind: "streak",
		username: toIdentity(e.user).username,
		league: e.league.slug,
		family: streakFamilyParam(e.family),
		mode,
	}) as const
