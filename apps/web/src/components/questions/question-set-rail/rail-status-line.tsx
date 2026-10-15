import { DateTime } from "luxon"
import { LockLine } from "#/components/questions/lock-line"
import type { QuestionSetRailRow } from "#/lib/question-set-rail"
import { monoSmall } from "./rail-styles"

// How fresh the live numbers are while there are any, since they trail the
// game by a few minutes. Otherwise how much is still open and when the first
// of it locks.
export function RailStatusLine({
	openUncalled,
	statsAsOf,
}: {
	openUncalled: QuestionSetRailRow[]
	statsAsOf: string | null
}) {
	if (statsAsOf) {
		return (
			<span className={monoSmall}>
				Stats as of {DateTime.fromISO(statsAsOf).toFormat("h:mm a")}
			</span>
		)
	}
	const firstLock = openUncalled
		.map((r) => r.locksAt)
		.sort()
		.at(0)
	if (!firstLock) return null
	return (
		<span className={monoSmall}>
			{openUncalled.length} still open ·{" "}
			<LockLine status="OPEN" locksAt={firstLock} />
		</span>
	)
}
