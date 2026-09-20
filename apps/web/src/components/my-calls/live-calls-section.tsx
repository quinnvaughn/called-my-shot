import { useQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { MyCallsTabFragment } from "#/components/my-calls/my-calls-tab"
import { CallCard } from "#/components/questions/call-card"
import { type FragmentType, useFragment } from "#/graphql/generated"
import {
	type MyCallsFilters,
	myLiveCallsQuery,
} from "#/graphql/queries/my-calls"

type LiveCall = { id: string } & FragmentType<typeof MyCallsTabFragment>

// The Open tab's calls whose game is being played right now, pinned above the
// rest of the list. The server keeps these out of that list (see
// Query.myLiveCalls), so nothing appears twice.
//
// Renders nothing at all when no game the viewer called is in flight, which is
// most of the time. That absence is the point: this used to be a "Live" sort
// pill, and on a day with nothing live it silently reordered nothing and
// produced the same list as every other ordering.
export function LiveCallsSection({ filters }: { filters: MyCallsFilters }) {
	const { data } = useQuery(myLiveCallsQuery(filters))
	const calls = data?.myLiveCalls ?? []
	if (calls.length === 0) return null

	return (
		<VStack alignItems="stretch" gap="3">
			<HStack gap="2" alignItems="center">
				<span
					className={css({
						width: "1.5",
						height: "1.5",
						borderRadius: "full",
						bg: "success.default",
						animation: "pulse 1.6s ease-in-out infinite",
					})}
				/>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: "fg.default",
						fontWeight: "bold",
					})}
				>
					Playing now
				</span>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.subtle",
					})}
				>
					{calls.length} call{calls.length === 1 ? "" : "s"}
				</span>
			</HStack>
			<VStack alignItems="stretch" gap="3">
				{calls.map((call) => (
					<LiveCallCard key={call.id} call={call} />
				))}
			</VStack>
			<div
				className={css({
					height: "1px",
					bg: "border.default",
					marginBlockStart: "1",
				})}
			/>
		</VStack>
	)
}

function LiveCallCard({ call }: { call: LiveCall }) {
	const data = useFragment(MyCallsTabFragment, call)
	return <CallCard call={data} />
}
