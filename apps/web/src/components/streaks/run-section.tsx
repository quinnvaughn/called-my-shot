import { css } from "styled-system/css"
import { CallCard } from "#/components/questions/call-card"
import { CardRail } from "#/components/ui/card-rail"
import type { Streak } from "#/lib/streak-view"

// Newest first, so the call that last extended the run leads the row.
export function RunSection({
	heading,
	calls,
}: {
	heading: string
	calls: Streak["currentRunCalls"]
}) {
	return (
		<CardRail
			items={[...calls].reverse()}
			getKey={(call) => call.id}
			renderItem={(call) => <CallCard call={call} />}
			itemLabel="call"
			header={
				<>
					<span
						className={css({
							textStyle: "label",
							color: "fg.subtle",
						})}
					>
						{heading}
					</span>
					<span
						className={css({
							textStyle: "meta",
							color: "fg.subtle",
						})}
					>
						{calls.length} calls
					</span>
				</>
			}
		/>
	)
}
