import { useQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { MyCallsTabFragment } from "#/components/my-calls/my-calls-tab"
import { CallCard } from "#/components/questions/call-card"
import { CardRail } from "#/components/ui/card-rail"
import { type FragmentType, useFragment } from "#/graphql/generated"
import {
	type MyCallsFilters,
	myLiveCallsQuery,
} from "#/graphql/queries/my-calls"

type LiveCall = { id: string } & FragmentType<typeof MyCallsTabFragment>

// The Open tab's calls whose game is being played right now, as a
// horizontally scrolling row between the tabs and the sort. The server keeps
// these out of the list below (see Query.myLiveCalls), so nothing appears
// twice.
//
// Renders nothing at all when no game the viewer called is in flight, which is
// most of the time.
export function LiveCallsSection({ filters }: { filters: MyCallsFilters }) {
	const { data } = useQuery(myLiveCallsQuery(filters))
	const calls = data?.myLiveCalls ?? []

	if (calls.length === 0) return null

	return (
		<section aria-label="Playing now">
			<VStack alignItems="stretch" gap="3">
				<CardRail
					items={calls}
					getKey={(call) => call.id}
					renderItem={(call) => <LiveCallCard call={call} />}
					itemLabel="live call"
					header={
						<>
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
						</>
					}
				/>
				<div
					className={css({
						height: "1px",
						bg: "border.default",
						marginBlockStart: "1",
					})}
				/>
			</VStack>
		</section>
	)
}

function LiveCallCard({ call }: { call: LiveCall }) {
	const data = useFragment(MyCallsTabFragment, call)
	return <CallCard call={data} />
}
