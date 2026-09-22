import type { ComponentProps } from "react"
import { PickPositionRow } from "#/components/questions/pick-position-row"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"

export const BallotPositionRowFragment = graphql(`
	fragment BallotPositionRow_member on BallotQuestion {
		id
		slot
		label
		section
		sortOrder
		# Read by the ballot page's progress stats as well as the row.
		question {
			id
			status
			locksAt
			callCount
			options {
				id
				fieldPct
			}
			...PickPositionRow_question
		}
	}
`)

type Props = {
	member: FragmentType<typeof BallotPositionRowFragment>
	// The viewer's own call on the ballot page, the entry owner's on
	// /ballots/<slug>/<username>. Null when that person hasn't called it.
	call: ComponentProps<typeof PickPositionRow>["call"]
}

// One member of a ballot's questions list, keyed by its slot and label.
export function BallotPositionRow({ member: memberProp, call }: Props) {
	const member = useFragment(BallotPositionRowFragment, memberProp)
	return (
		<PickPositionRow
			question={member.question}
			call={call}
			code={member.slot ?? null}
			label={member.label}
		/>
	)
}
