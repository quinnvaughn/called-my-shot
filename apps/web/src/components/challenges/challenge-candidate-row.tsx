import { ToggleRow } from "#/components/ui/toggle-row"
import type { ChallengeCandidatesQuery } from "#/graphql/generated/graphql"
import { pickSummary } from "#/lib/call-summary"
import { formatShortDate } from "#/lib/format-date"

export type Candidate = ChallengeCandidatesQuery["challengeCandidates"][number]

export function ChallengeCandidateRow({
	question,
	checked,
	onChange,
}: {
	question: Candidate
	checked: boolean
	onChange: (on: boolean) => void
}) {
	return (
		<ToggleRow
			label={question.title}
			description={
				question.viewerCall
					? `Your call: ${pickSummary(question.viewerCall)} · locks ${formatShortDate(question.locksAt)}`
					: `Not called yet · locks ${formatShortDate(question.locksAt)}`
			}
			checked={checked}
			onChange={onChange}
		/>
	)
}
