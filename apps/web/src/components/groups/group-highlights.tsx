import type { StreakMode } from "@called-my-shot/scoring"
import { css } from "styled-system/css"
import { Grid, VStack } from "styled-system/jsx"
import { EmptyState } from "#/components/ui/empty-state"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import {
	coldStreakText,
	type StreakFamilyValue,
	streakFamilyParam,
} from "#/lib/streak-meta"
import { openModal } from "#/stores/modal-store"
import { GroupHighlightsSheet } from "./group-highlights-sheet"
import { HighlightList, HighlightRow } from "./highlight-row"

export const GroupStreakEntryFragment = graphql(`
	fragment GroupHighlights_streak on GroupStreakEntry {
		user {
			id
			name
			username
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
			id
			name
			username
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
	user: { id: string; name: string; username: string }
	league: { id: string; abbreviation: string; slug: string }
	family: StreakFamilyValue
	familyLabel: string
	currentLength: number
	bestLength: number
	currentColdLength: number
	worstColdLength: number
}

export type SweepEntry = {
	user: { id: string; name: string; username: string }
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

const entryKey = (e: StreakEntry) => `${e.user.id}-${e.league.id}-${e.family}`

// A hot row and a cold row can name the same track, so each says which side
// of it the reader just clicked on rather than letting the page guess.
const streakTo = (e: StreakEntry, mode: StreakMode) =>
	({
		kind: "streak",
		username: e.user.username,
		league: e.league.slug,
		family: streakFamilyParam(e.family),
		mode,
	}) as const

export function HotStreakRows({ entries }: { entries: StreakEntry[] }) {
	return (
		<VStack alignItems="stretch" gap="2">
			{entries.map((e) => (
				<HighlightRow
					key={entryKey(e)}
					name={e.user.name}
					username={e.user.username}
					leagueAbbr={e.league.abbreviation}
					label={e.familyLabel}
					value={`${e.currentLength} in a row`}
					note={`Best ${e.bestLength}`}
					to={streakTo(e, "hot")}
				/>
			))}
		</VStack>
	)
}

// The group's longest runs ever, shown in the hot list's place when nobody is
// on one now. These are history, so they lead with the best length and don't
// claim anything about right now.
export function StreakRecordRows({ entries }: { entries: StreakEntry[] }) {
	return (
		<VStack alignItems="stretch" gap="2">
			{entries.map((e) => (
				<HighlightRow
					key={entryKey(e)}
					name={e.user.name}
					username={e.user.username}
					leagueAbbr={e.league.abbreviation}
					label={e.familyLabel}
					value={`${e.bestLength} in a row`}
					to={streakTo(e, "hot")}
				/>
			))}
		</VStack>
	)
}

export function ColdStreakRows({ entries }: { entries: StreakEntry[] }) {
	return (
		<VStack alignItems="stretch" gap="2">
			{entries.map((e) => (
				<HighlightRow
					key={entryKey(e)}
					name={e.user.name}
					username={e.user.username}
					leagueAbbr={e.league.abbreviation}
					label={e.familyLabel}
					value={coldStreakText(e.currentColdLength)}
					note={`Worst ${e.worstColdLength}`}
					to={streakTo(e, "cold")}
				/>
			))}
		</VStack>
	)
}

export function SweepRows({ entries }: { entries: SweepEntry[] }) {
	return (
		<VStack alignItems="stretch" gap="2">
			{entries.map((e) => (
				<HighlightRow
					key={`${e.user.id}-${e.league.id}-${e.slateKey}`}
					name={e.user.name}
					username={e.user.username}
					leagueAbbr={e.league.abbreviation}
					label={e.slateLabel}
					value={`${e.gameCount} for ${e.gameCount}`}
					to={{
						kind: "sweep",
						username: e.user.username,
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

// Who's hot, who's cold and who just swept, between the group's leaderboard
// and its activity tabs. Deliberately outside the leaderboard's league and
// season filters: a streak has no season at all, so following them would
// filter the sweeps and leave the streaks alone. Every row carries its own
// league tag instead.
//
// Each list is capped at three here; "see all" opens the sheet.
export function GroupHighlights(props: Props) {
	const { groupId } = props
	const hotStreaks = useStreakEntries(props.hotStreaks)
	const coldStreaks = useStreakEntries(props.coldStreaks)
	const streakRecords = useStreakEntries(props.streakRecords)
	const recentSweeps = useSweepEntries(props.recentSweeps)

	// A group nobody has settled a call in yet gets no band at all, rather
	// than three empty boxes.
	if (
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

	return (
		<VStack alignItems="stretch" gap="3">
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
			{/* Wide enough on md that one column's "see all" reads as belonging
			 * to it rather than to the next column's heading. */}
			<Grid
				gridTemplateColumns={{ base: "1fr", md: "1fr 1fr" }}
				gap={{ base: "5", md: "8" }}
			>
				<HighlightList
					label={live ? "Hot streaks" : "Best streaks"}
					onSeeAll={live ? seeAll("hot") : undefined}
				>
					{live ? (
						<HotStreakRows entries={hotStreaks} />
					) : streakRecords.length > 0 ? (
						<StreakRecordRows entries={streakRecords} />
					) : (
						<EmptyState>Nobody's put a run together yet.</EmptyState>
					)}
				</HighlightList>
				<HighlightList
					label="Cold streaks"
					onSeeAll={coldStreaks.length > 0 ? seeAll("cold") : undefined}
				>
					{coldStreaks.length > 0 ? (
						<ColdStreakRows entries={coldStreaks} />
					) : (
						<EmptyState>Nobody's cold right now.</EmptyState>
					)}
				</HighlightList>
			</Grid>
			<HighlightList
				label="Latest sweeps"
				onSeeAll={recentSweeps.length > 0 ? seeAll("sweeps") : undefined}
			>
				{recentSweeps.length > 0 ? (
					<SweepRows entries={recentSweeps} />
				) : (
					<EmptyState>No sweeps yet.</EmptyState>
				)}
			</HighlightList>
		</VStack>
	)
}
