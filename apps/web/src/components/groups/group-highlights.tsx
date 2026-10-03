import type { StreakMode } from "@called-my-shot/scoring"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { EmptyState } from "#/components/ui/empty-state"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { type IdentityUser, toIdentity } from "#/lib/identity"
import { type StreakFamilyValue, streakFamilyParam } from "#/lib/streak-meta"
import { openModal } from "#/stores/modal-store"
import { GroupHighlightsSheet } from "./group-highlights-sheet"
import { HighlightList, HighlightRow } from "./highlight-row"

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

// The unwrapped rows the list components below take, so the band and the
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

const entryKey = (e: StreakEntry) =>
	`${toIdentity(e.user).id}-${e.league.id}-${e.family}`

// A hot row and a cold row can name the same track, so each says which side
// of it the reader just clicked on rather than letting the page guess.
const streakTo = (e: StreakEntry, mode: StreakMode) =>
	({
		kind: "streak",
		username: toIdentity(e.user).username,
		league: e.league.slug,
		family: streakFamilyParam(e.family),
		mode,
	}) as const

export function HotStreakRows({
	entries,
	compact,
}: {
	entries: StreakEntry[]
	compact?: boolean
}) {
	return (
		<VStack alignItems="stretch" gap="2">
			{entries.map((e) => (
				<HighlightRow
					compact={compact}
					key={entryKey(e)}
					user={toIdentity(e.user)}
					leagueAbbr={e.league.abbreviation}
					label={e.familyLabel}
					value={`${e.currentLength}`}
					valueLabel="in a row"
					// Only when the run they are on is not their best one. On a row
					// where it is, "Best 8" under an 8 is the same number twice.
					note={
						e.bestLength > e.currentLength ? `Best ${e.bestLength}` : undefined
					}
					to={streakTo(e, "hot")}
				/>
			))}
		</VStack>
	)
}

// The group's longest runs ever, shown in the hot list's place when nobody is
// on one now. These are history, so they lead with the best length and don't
// claim anything about right now.
export function StreakRecordRows({
	entries,
	compact,
}: {
	entries: StreakEntry[]
	compact?: boolean
}) {
	return (
		<VStack alignItems="stretch" gap="2">
			{entries.map((e) => (
				<HighlightRow
					compact={compact}
					key={entryKey(e)}
					user={toIdentity(e.user)}
					leagueAbbr={e.league.abbreviation}
					label={e.familyLabel}
					value={`${e.bestLength}`}
					valueLabel="in a row"
					to={streakTo(e, "hot")}
				/>
			))}
		</VStack>
	)
}

export function ColdStreakRows({
	entries,
	compact,
}: {
	entries: StreakEntry[]
	compact?: boolean
}) {
	return (
		<VStack alignItems="stretch" gap="2">
			{entries.map((e) => (
				<HighlightRow
					compact={compact}
					key={entryKey(e)}
					user={toIdentity(e.user)}
					leagueAbbr={e.league.abbreviation}
					label={e.familyLabel}
					value={`${e.currentColdLength}`}
					valueLabel={e.currentColdLength === 1 ? "miss" : "misses"}
					note={
						e.worstColdLength > e.currentColdLength
							? `Worst ${e.worstColdLength}`
							: undefined
					}
					to={streakTo(e, "cold")}
				/>
			))}
		</VStack>
	)
}

export function SweepRows({
	entries,
	compact,
}: {
	entries: SweepEntry[]
	compact?: boolean
}) {
	return (
		<VStack alignItems="stretch" gap="2">
			{entries.map((e) => (
				<HighlightRow
					compact={compact}
					key={`${toIdentity(e.user).id}-${e.league.id}-${e.slateKey}`}
					user={toIdentity(e.user)}
					leagueAbbr={e.league.abbreviation}
					label={e.slateLabel}
					// Under a "sweeps" heading, "swept" and "8 for 8" are both
					// already said. The size of the slate is the part that isn't.
					value={`${e.gameCount}`}
					valueLabel={e.gameCount === 1 ? "game" : "games"}
					to={{
						kind: "sweep",
						username: toIdentity(e.user).username,
						league: e.league.slug,
						slateKey: e.slateKey,
					}}
				/>
			))}
		</VStack>
	)
}

type Props = {
	groupId: string
	hotStreaks: readonly FragmentType<typeof GroupStreakEntryFragment>[]
	coldStreaks: readonly FragmentType<typeof GroupStreakEntryFragment>[]
	streakRecords: readonly FragmentType<typeof GroupStreakEntryFragment>[]
	recentSweeps: readonly FragmentType<typeof GroupSweepEntryFragment>[]
}

// Who's hot, who's cold and who just swept. Deliberately outside the
// leaderboard's league and season filters: a streak has no season at all, so
// following them would filter the sweeps and leave the streaks alone. Every
// row carries its own league tag instead.
//
// Each list is capped at three; "see all" opens the sheet. The band renders
// nothing for a group nobody has settled a call in yet, rather than three empty
// boxes mid-page. The rail always shows its lists, so the column is never
// blank.
function Highlights({
	placement,
	...props
}: Props & { placement: "band" | "rail" }) {
	const { groupId } = props
	const hotStreaks = useStreakEntries(props.hotStreaks)
	const coldStreaks = useStreakEntries(props.coldStreaks)
	const streakRecords = useStreakEntries(props.streakRecords)
	const recentSweeps = useSweepEntries(props.recentSweeps)

	if (
		placement === "band" &&
		hotStreaks.length === 0 &&
		coldStreaks.length === 0 &&
		streakRecords.length === 0 &&
		recentSweeps.length === 0
	) {
		return null
	}

	const seeAll = (tab: "hot" | "cold" | "sweeps") => () =>
		openModal(<GroupHighlightsSheet groupId={groupId} initialTab={tab} />)
	const live = hotStreaks.length > 0
	const compact = placement === "rail"

	return (
		<VStack
			alignItems="stretch"
			gap="3"
			// The band is the below-xl stand-in for the rail, which the shell
			// only shows from xl.
			display={placement === "band" ? { base: "flex", xl: "none" } : "flex"}
		>
			<h2
				className={css({
					fontFamily: "mono",
					fontSize: "xs",
					letterSpacing: "wide",
					color: "fg.muted",
					textTransform: "uppercase",
				})}
			>
				Highlights
			</h2>
			<VStack alignItems="stretch" gap={compact ? "6" : "5"}>
				<HighlightList
					label={live ? "Hot streaks" : "Best streaks"}
					onSeeAll={live ? seeAll("hot") : undefined}
				>
					{live ? (
						<HotStreakRows entries={hotStreaks} compact={compact} />
					) : streakRecords.length > 0 ? (
						<StreakRecordRows entries={streakRecords} compact={compact} />
					) : (
						<EmptyState>Nobody's put a run together yet.</EmptyState>
					)}
				</HighlightList>
				<HighlightList
					label="Cold streaks"
					onSeeAll={coldStreaks.length > 0 ? seeAll("cold") : undefined}
				>
					{coldStreaks.length > 0 ? (
						<ColdStreakRows entries={coldStreaks} compact={compact} />
					) : (
						<EmptyState>Nobody's cold right now.</EmptyState>
					)}
				</HighlightList>
				<HighlightList
					label="Latest sweeps"
					onSeeAll={recentSweeps.length > 0 ? seeAll("sweeps") : undefined}
				>
					{recentSweeps.length > 0 ? (
						<SweepRows entries={recentSweeps} compact={compact} />
					) : (
						<EmptyState>No sweeps yet.</EmptyState>
					)}
				</HighlightList>
			</VStack>
		</VStack>
	)
}

// Between the group page's leaderboard and its activity tabs, below xl.
export function GroupHighlights(props: Props) {
	return <Highlights {...props} placement="band" />
}

// The group page's right rail, from xl.
export function GroupHighlightsRail(props: Props) {
	return <Highlights {...props} placement="rail" />
}
