import { Fragment } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { BallotPositionRow } from "#/components/ballots/ballot-position-row"
import { BallotSectionHeading } from "#/components/ballots/ballot-section-heading"
import { Card } from "#/components/ui/card"
import type {
	BallotByRefQuery,
	BallotPositionRow_MemberFragment,
} from "#/graphql/generated/graphql"

type Props = {
	ballot: NonNullable<BallotByRefQuery["ballot"]>
	// ballot.members unmasked, in the same order.
	members: BallotPositionRow_MemberFragment[]
}

export function BallotQuestionList({ ballot, members }: Props) {
	return (
		<VStack gap="3" alignItems="stretch">
			<span
				className={css({
					textStyle: "label",
					color: "fg.subtle",
				})}
			>
				Questions
			</span>
			<Card>
				<VStack gap="0" alignItems="stretch">
					{ballot.members.map((member, i) => {
						// Rendered from the still-masked ballot.members (passed
						// straight through, unmasked again inside
						// BallotPositionRow) - members[i] is the same list
						// already unmasked by the page, for the id this needs as
						// a key and for the section heading below.
						const section = members[i].section
						return (
							<Fragment key={members[i].id}>
								{section && section !== members[i - 1]?.section && (
									<BallotSectionHeading label={section} />
								)}
								<BallotPositionRow
									member={member}
									call={member.question.viewerCall}
								/>
							</Fragment>
						)
					})}
				</VStack>
			</Card>
		</VStack>
	)
}
