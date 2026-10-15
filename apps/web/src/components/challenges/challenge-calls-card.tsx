import { css } from "styled-system/css"
import { ChallengeQuestionRow } from "#/components/challenges/challenge-question-row/challenge-question-row"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import type { ChallengePageQuery } from "#/graphql/generated/graphql"

type Props = {
	challenge: NonNullable<ChallengePageQuery["challenge"]>
	isCreator: boolean
}

export function ChallengeCallsCard({ challenge, isCreator }: Props) {
	const creator = challenge.creator
	const viewerMatchup = challenge.viewerMatchup

	return (
		<Card size="md">
			<Card.Header>
				<Eyebrow variant="neutral">
					{isCreator
						? "Your calls"
						: viewerMatchup
							? `Your 1v1 with @${creator.username}`
							: `@${creator.username}'s calls`}
				</Eyebrow>
			</Card.Header>
			<Card.Body className={css({ paddingBlock: "0" })}>
				{challenge.entries.map((entry) => (
					<ChallengeQuestionRow
						key={entry.question.id}
						entry={entry}
						row={
							viewerMatchup?.rows.find(
								(r) => r.question.id === entry.question.id,
							) ?? null
						}
						creatorLabel={isCreator ? "You" : `@${creator.username}`}
						viewerSide={isCreator ? "creator" : "opponent"}
						opponent={
							isCreator
								? null
								: viewerMatchup
									? { label: "You" }
									: entry.question.viewerCall
										? { label: "You", call: entry.question.viewerCall }
										: null
						}
					/>
				))}
			</Card.Body>
		</Card>
	)
}
