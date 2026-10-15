import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { PossiblePoints } from "#/components/challenges/possible-points"
import { CardRule } from "#/components/questions/card-rule"
import {
	type CallDraft,
	CastCallFormFragment,
} from "#/components/questions/cast-call-form"
import { PickList } from "#/components/questions/pick-list"
import { QuestionSummaryHeader } from "#/components/questions/question-summary-header"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { useFragment as unmask } from "#/graphql/generated"
import { draftSummary, entryPoints } from "#/lib/challenge"
import { sideLabel } from "./styles"
import type { Entry } from "./types"

export function ChallengeReviewRow({
	entry,
	creatorUsername,
	showGame,
	draft,
	alreadyCalled,
	onEdit,
}: {
	entry: Entry
	creatorUsername: string
	showGame: boolean
	draft: CallDraft | undefined
	alreadyCalled: boolean
	onEdit: () => void
}) {
	const form = unmask(CastCallFormFragment, entry.question)
	const yours = alreadyCalled
		? entry.question.viewerCall
		: draft
			? draftSummary(form, draft)
			: null
	const { yours: yourPoints, creator: creatorPoints } = entryPoints({
		question: form,
		viewerCall: entry.question.viewerCall,
		creatorCall: entry.creatorCall,
		draft,
		alreadyCalled,
	})

	return (
		<Card variant="surface" size="md">
			<Card.Body>
				<VStack gap="4" alignItems="stretch">
					<QuestionSummaryHeader
						question={entry.question}
						showGame={showGame}
					/>
					<CardRule />
					<VStack gap="4" alignItems="stretch">
						<VStack gap="2" alignItems="stretch">
							<HStack justify="space-between" alignItems="center" gap="3">
								<span className={sideLabel}>
									{alreadyCalled ? "Your call (already in)" : "Your call"}
								</span>
								{!alreadyCalled && (
									<Button variant="dark" size="sm" onClick={onEdit}>
										{draft ? "Change" : "Call it"}
									</Button>
								)}
							</HStack>
							{yours ? (
								<VStack gap="2" alignItems="stretch">
									<PickList call={yours} />
									{yourPoints && <PossiblePoints range={yourPoints} />}
								</VStack>
							) : (
								<p className={css({ fontSize: "sm", color: "fg.muted" })}>
									Not called yet
								</p>
							)}
						</VStack>
						<VStack
							gap="2"
							alignItems="stretch"
							className={css({
								paddingTop: "4",
								borderTop: "1px solid {colors.border.default}",
							})}
						>
							<span className={sideLabel}>@{creatorUsername}'s call</span>
							{entry.creatorCall ? (
								<VStack gap="2" alignItems="stretch">
									<PickList call={entry.creatorCall} />
									{creatorPoints && <PossiblePoints range={creatorPoints} />}
								</VStack>
							) : (
								<p className={css({ fontSize: "sm", color: "fg.muted" })}>
									Not called yet
								</p>
							)}
						</VStack>
					</VStack>
				</VStack>
			</Card.Body>
		</Card>
	)
}
