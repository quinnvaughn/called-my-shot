import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import {
	type CallDraft,
	CastCallFormFragment,
} from "#/components/questions/cast-call-form"
import { Card } from "#/components/ui/card"
import { useFragment as unmask } from "#/graphql/generated"
import { entryPoints, totalsOf } from "#/lib/challenge"
import { ChallengeReviewRow } from "./challenge-review-row"
import { sideLabel } from "./styles"
import { TotalsLine } from "./totals-line"
import type { Challenge } from "./types"

export function ChallengeReview({
	challenge,
	showGame,
	drafts,
	onEdit,
}: {
	challenge: Challenge
	showGame: boolean
	drafts: Record<string, CallDraft>
	onEdit: (index: number) => void
}) {
	const missingIds = challenge.viewerMissingQuestionIds
	const points = challenge.entries.map((entry) =>
		entryPoints({
			question: unmask(CastCallFormFragment, entry.question),
			viewerCall: entry.question.viewerCall,
			creatorCall: entry.creatorCall,
			draft: drafts[entry.question.id],
			alreadyCalled: !missingIds.includes(entry.question.id),
		}),
	)
	return (
		<VStack gap="3" alignItems="stretch">
			<Card variant="subtle" size="md">
				<Card.Body>
					<VStack gap="3" alignItems="stretch">
						<span className={sideLabel}>Across all of them</span>
						<TotalsLine
							label="You"
							totals={totalsOf(points.map((p) => p.yours))}
						/>
						<TotalsLine
							label={`@${challenge.creator.username}`}
							totals={totalsOf(points.map((p) => p.creator))}
						/>
						<p className={css({ fontSize: "xs", color: "fg.subtle" })}>
							The 1v1 goes to whoever ends up with more, so a mix of hits and
							misses lands somewhere in between.
						</p>
					</VStack>
				</Card.Body>
			</Card>
			{challenge.entries.map((entry) => {
				const index = missingIds.indexOf(entry.question.id)
				return (
					<ChallengeReviewRow
						key={entry.question.id}
						entry={entry}
						creatorUsername={challenge.creator.username}
						showGame={showGame}
						draft={drafts[entry.question.id]}
						alreadyCalled={index === -1}
						onEdit={() => onEdit(index)}
					/>
				)
			})}
		</VStack>
	)
}
