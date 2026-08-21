import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import type { GameStatus, QuestionType } from "#/graphql/generated/graphql"
import { questionTypeLabel } from "#/lib/question-labels"
import { GameBlock } from "./game-block"
import { PickStateIcon } from "./pick-state-icon"

type QuestionSummaryData = {
	title: string
	type: QuestionType
	isOfficial: boolean
	league: { abbreviation: string }
	// The single real-world matchup this question is about - null for
	// anything not scoped to one game (season awards, an MVP race).
	game: {
		status: GameStatus
		startsAt: string
		homeScore: number | null
		awayScore: number | null
		homeTeam: { abbreviation: string; color: string }
		awayTeam: { abbreviation: string; color: string }
	} | null
}

type Props = {
	question: QuestionSummaryData
	// Who put this question in front of the viewer in *this* list - QuestionCard
	// only, since CallCard's list is calls, not shares. The Shared tab this
	// comes from excludes the viewer's own shares server-side, so it's always
	// someone else's name, never "You".
	sharedBy?: { name: string }
	// QuestionCard only - CallCard already shows what kind of pick this is
	// via the pick itself, so calling out the type again here would be
	// redundant there.
	showTypeTag?: boolean
	// QuestionCard only - whether the viewer has already made a call on this
	// question. CallCard is always about someone else's pick, so there's no
	// "did I call this" to show there.
	viewerCalled?: boolean
}

// Shared between QuestionCard and CallCard - both lead with "what is this
// question" (sport, title, game) before getting into whatever's specific to
// that card (aggregate stats/result vs. a particular person's pick). Neither
// credits the question's creator here - CallCard leads with who CALLED it
// instead (shown separately below), and QuestionCard drops the credit line
// entirely since the title carries enough on its own.
export function QuestionSummaryHeader({
	question,
	sharedBy,
	showTypeTag,
	viewerCalled,
}: Props) {
	return (
		<VStack gap="3" alignItems="stretch">
			<HStack justify="space-between" alignItems="center" gap="2">
				<HStack gap="2" alignItems="center">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "3xs",
							letterSpacing: "wide",
							textTransform: "uppercase",
							color: "fg.subtle",
						})}
					>
						{question.league.abbreviation}
						{showTypeTag && ` · ${questionTypeLabel[question.type]}`}
					</span>
					{question.isOfficial && (
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "4xs",
								fontWeight: "bold",
								letterSpacing: "wide",
								textTransform: "uppercase",
								color: "primary.default",
								backgroundColor: "primary.subtle",
								padding: "{spacing.0.5} {spacing.1.5}",
								borderRadius: "sm",
							})}
						>
							Official
						</span>
					)}
				</HStack>
				{viewerCalled && <PickStateIcon state="win" />}
			</HStack>
			{sharedBy && (
				<span
					className={css({
						fontSize: "xs",
						color: "fg.subtle",
						fontFamily: "mono",
					})}
				>
					Shared by {sharedBy.name}
				</span>
			)}
			<span
				className={css({
					fontWeight: "bold",
					fontSize: "xl",
					lineHeight: "snug",
				})}
			>
				{question.title}
			</span>
			{question.game && <GameBlock game={question.game} />}
		</VStack>
	)
}
