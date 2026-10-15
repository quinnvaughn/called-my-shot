import { useQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { CardRail } from "#/components/ui/card-rail"
import { LiveDot } from "#/components/ui/live-dot"
import {
	type MyCallsFilters,
	myLiveCallsQuery,
} from "#/graphql/my-calls/queries"
import { pluralize } from "#/lib/pluralize"
import { MyCallCard } from "./my-call-card"

// The viewer's calls whose game is being played right now, as a horizontally
// scrolling row. On My Calls it sits between the Open tab's tabs and sort, and
// the server keeps these out of the list below it (see Query.myLiveCalls), so
// nothing appears twice on that page. Home shows the same row unfiltered.
//
// Renders nothing at all when no game the viewer called is in flight, which is
// most of the time.
//
// `divider` rules it off from a list directly beneath it. It lives here rather
// than at the call site so it disappears along with the row.
export function LiveCallsSection({
	filters,
	divider = false,
}: {
	filters: MyCallsFilters
	divider?: boolean
}) {
	const { data } = useQuery(myLiveCallsQuery(filters))
	const calls = data?.myLiveCalls ?? []

	if (calls.length === 0) return null

	return (
		<section aria-label="Playing now">
			<VStack alignItems="stretch" gap="3">
				<CardRail
					items={calls}
					getKey={(call) => call.id}
					renderItem={(call) => <MyCallCard call={call} />}
					itemLabel="live call"
					header={
						<>
							<LiveDot />
							<span
								className={css({
									textStyle: "label",
									color: "fg.default",
									fontWeight: "bold",
								})}
							>
								Playing now
							</span>
							<span
								className={css({
									textStyle: "meta",
									color: "fg.subtle",
								})}
							>
								{calls.length} {pluralize(calls.length, "call")}
							</span>
						</>
					}
				/>
				{divider && (
					<div
						className={css({
							height: "1px",
							bg: "border.default",
							marginBlockStart: "1",
						})}
					/>
				)}
			</VStack>
		</section>
	)
}
