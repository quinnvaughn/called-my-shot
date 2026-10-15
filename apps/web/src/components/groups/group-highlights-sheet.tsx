import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { EmptyState } from "#/components/ui/empty-state"
import { Sheet } from "#/components/ui/sheet"
import { Tabs } from "#/components/ui/tabs"
import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"
import { ColdStreakRows } from "./cold-streak-rows"
import { useStreakEntries, useSweepEntries } from "./group-highlight-entries"
import { HotStreakRows } from "./hot-streak-rows"
import { StreakRecordRows } from "./streak-record-rows"
import { SweepRows } from "./sweep-rows"

// The full lists behind the band's "see all". Its own query rather than more
// of GroupShell's: the rail asks for three of each on every group page load,
// and nobody should pay for fifty until they open this.
export const GroupHighlightsDocument = graphql(`
	query GroupHighlights($groupId: ID!) {
		group(id: $groupId) {
			id
			hotStreaks {
				...GroupHighlights_streak
			}
			coldStreaks {
				...GroupHighlights_streak
			}
			streakRecords {
				...GroupHighlights_streak
			}
			recentSweeps {
				...GroupHighlights_sweep
			}
		}
	}
`)

type Tab = "hot" | "cold" | "sweeps"

export function GroupHighlightsSheet({
	groupId,
	initialTab,
}: {
	groupId: string
	// Whichever list's "see all" was clicked.
	initialTab: Tab
}) {
	const [tab, setTab] = useState<Tab>(initialTab)
	const { data } = useQuery(
		gqlQueryOptions(GroupHighlightsDocument, { groupId }),
	)
	const group = data?.group
	const hot = useStreakEntries(group?.hotStreaks ?? [])
	const cold = useStreakEntries(group?.coldStreaks ?? [])
	const records = useStreakEntries(group?.streakRecords ?? [])
	const sweeps = useSweepEntries(group?.recentSweeps ?? [])

	return (
		<Sheet>
			<Sheet.Header>
				<Sheet.Title>Highlights</Sheet.Title>
				<Sheet.CloseButton />
			</Sheet.Header>
			<Sheet.Body>
				<VStack alignItems="stretch" gap="4">
					<Tabs value={tab} onValueChange={setTab}>
						<Tabs.List stretch>
							<Tabs.Trigger value="hot">Hot</Tabs.Trigger>
							<Tabs.Trigger value="cold">Cold</Tabs.Trigger>
							<Tabs.Trigger value="sweeps">Sweeps</Tabs.Trigger>
						</Tabs.List>
					</Tabs>
					{data &&
						match(tab)
							// Same fallback as the band: with no live run to show, the
							// group's longest ever is what's left to say.
							.with("hot", () =>
								hot.length > 0 ? (
									<HotStreakRows entries={hot} />
								) : records.length > 0 ? (
									<StreakRecordRows entries={records} />
								) : (
									<EmptyState>Nobody's put a run together yet.</EmptyState>
								),
							)
							.with("cold", () =>
								cold.length > 0 ? (
									<ColdStreakRows entries={cold} />
								) : (
									<EmptyState>Nobody's cold right now.</EmptyState>
								),
							)
							.with("sweeps", () =>
								sweeps.length > 0 ? (
									<SweepRows entries={sweeps} />
								) : (
									<EmptyState>No sweeps yet.</EmptyState>
								),
							)
							.exhaustive()}
				</VStack>
			</Sheet.Body>
		</Sheet>
	)
}
