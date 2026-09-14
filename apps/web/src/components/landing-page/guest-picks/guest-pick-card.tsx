import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { LockLine } from "#/components/questions/lock-line"
import { QuestionSummaryHeader } from "#/components/questions/question-summary-header"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { callersText, isRateStat } from "#/lib/field-signal"
import {
	isOverUnderQuestionShape,
	optionDisplayLabel,
} from "#/lib/question-labels"
import type { GuestPick } from "#/stores/guest-picks-store"

export const GuestPickCardFragment = graphql(`
	fragment GuestPickCard_question on Question {
		id
		title
		shape
		isOfficial
		locksAt
		callCount
		ouLine
		numericToleranceAbsolute
		stat {
			id
			toleranceTier {
				id
				toleranceMode
				toleranceValue
			}
		}
		league {
			id
			abbreviation
		}
		options {
			id
			label
			fieldPct
			callCount
		}
		game {
			id
			...GameStarters_game
			status
			startsAt
			homeScore
			awayScore
			venue
			homeTeam {
				id
				name
				abbreviation
				color
			}
			awayTeam {
				id
				name
				abbreviation
				color
			}
			homeTeamRecord {
				wins
				losses
				ties
			}
			awayTeamRecord {
				wins
				losses
				ties
			}
		}
	}
`)

type Props = {
	question: FragmentType<typeof GuestPickCardFragment>
	pickedOptionId: string | null
	onPick: (pick: GuestPick) => void
}

const mutedMonoClass = css({
	fontFamily: "mono",
	fontSize: "3xs",
	color: "fg.subtle",
	whiteSpace: "nowrap",
})

const optionBaseClass = css({
	display: "flex",
	alignItems: "center",
	gap: "3",
	width: "full",
	textAlign: "left",
	borderRadius: "lg",
	padding: "4",
	cursor: "pointer",
	transition: "border-color 0.15s ease, background-color 0.15s ease",
})
const optionIdleClass = css({
	backgroundColor: "bg.subtle",
	border: "1px solid {colors.border.emphasized}",
	_hover: {
		backgroundColor: "primary.subtle",
		border: "1px solid {colors.primary.default}",
	},
})
const optionSelectedClass = css({
	backgroundColor: "primary.subtle",
	border: "1px solid {colors.primary.default}",
})

const radioBaseClass = css({
	width: "5",
	height: "5",
	borderRadius: "full",
	flexShrink: "0",
	transition: "border-width 0.15s ease",
})
const radioIdleClass = css({
	border: "2px solid {colors.border.emphasized}",
})
const radioSelectedClass = css({
	border: "6px solid {colors.primary.default}",
})

// One question in the landing page's try-it stack. The game shows the same
// full matchup header the question page uses (team names, records, starters),
// since that's what someone wants in front of them before picking a side. The
// options are big radio-style buttons rather than the question page's stat
// rows, so a visitor who has never seen the app reads them as something to tap.
// Held to a fixed minimum height so moving between cards with and without a
// game doesn't shift the hero around.
export function GuestPickCard({
	question: questionProp,
	pickedOptionId,
	onPick,
}: Props) {
	const question = useFragment(GuestPickCardFragment, questionProp)
	const isOverUnder = isOverUnderQuestionShape(question.shape)
	const rateStat = isRateStat(question)

	return (
		<Card variant="surface" size="lg">
			<Card.Body>
				<VStack
					gap="4"
					alignItems="stretch"
					className={css({ minHeight: "26rem" })}
				>
					<QuestionSummaryHeader
						question={question}
						showTypeTag
						showGame={false}
					/>
					{question.game && (
						<GameMatchupHeader
							game={question.game}
							starters={question.game}
							compactStarters
						/>
					)}
					<VStack gap="2.5" alignItems="stretch" marginTop="auto">
						<span
							className={css({
								fontSize: "md",
								fontWeight: "semibold",
								color: "fg.default",
							})}
						>
							Tap your call
						</span>
						{question.options.map((option) => {
							const label = optionDisplayLabel(
								option.label,
								isOverUnder,
								question.ouLine,
								rateStat,
							)
							const selected = option.id === pickedOptionId
							return (
								<button
									key={option.id}
									type="button"
									aria-pressed={selected}
									className={cx(
										optionBaseClass,
										selected ? optionSelectedClass : optionIdleClass,
									)}
									onClick={() =>
										onPick({
											questionId: question.id,
											optionId: option.id,
											shape: question.shape,
											title: question.title,
											optionLabel: label,
											locksAt: question.locksAt,
										})
									}
								>
									<span
										className={cx(
											radioBaseClass,
											selected ? radioSelectedClass : radioIdleClass,
										)}
									/>
									<span
										className={css({
											flex: "1",
											fontSize: "lg",
											fontWeight: "semibold",
										})}
									>
										{label}
									</span>
									{selected ? (
										<span
											className={css({
												fontFamily: "mono",
												fontSize: "xs",
												fontWeight: "bold",
												color: "primary.default",
											})}
										>
											Your call
										</span>
									) : (
										option.callCount > 0 &&
										option.fieldPct !== null && (
											<span
												className={css({
													fontFamily: "mono",
													fontSize: "xs",
													color: "fg.muted",
												})}
											>
												{Math.round(option.fieldPct)}% picked
											</span>
										)
									)}
								</button>
							)
						})}
					</VStack>
					<HStack justify="space-between" alignItems="center" gap="3">
						<span className={mutedMonoClass}>
							{callersText(question.callCount)}
						</span>
						<span className={mutedMonoClass}>
							<LockLine status="OPEN" locksAt={question.locksAt} />
						</span>
					</HStack>
				</VStack>
			</Card.Body>
		</Card>
	)
}
