import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { callersText } from "#/lib/field-signal"
import { LockLine } from "../questions/lock-line"
import { LockedBadge } from "../questions/locked-badge"
import { OptionRow } from "../questions/option-row"
import { PickStateIcon } from "../questions/pick-state-icon"
import { QuestionResultBlock } from "../questions/question-result-block"

export const GameWinnerCardFragment = graphql(`
	fragment GameWinnerCard_question on Question {
		id
		isOfficial
		status
		shape
		locksAt
		callCount
		numericActualValue
		averageGuess
		numericToleranceAbsolute
		stat {
			id
			toleranceTier {
				id
				toleranceMode
				toleranceValue
			}
		}
		ouLine
		options {
			id
			label
			fieldPct
			callCount
			isCorrect
		}
		viewerCall {
			id
			selections {
				id
				option {
					id
				}
			}
		}
	}
`)

type Props = {
	question: FragmentType<typeof GameWinnerCardFragment>
}

// The "who wins?" (team_vs_team) question a game's own detail page leads
// with - a distinct card type, not a QuestionCard, because it's always
// exactly two options and the whole point of surfacing it prominently is
// showing the live field consensus right here, not hiding it behind the
// click-through the way every other card's one-line signal text does. No
// GameBlock here on purpose - the page's own GameMatchupHeader is right
// above this card, so repeating the matchup would just be noise, unlike
// every other place a question card renders GameBlock.
export function GameWinnerCard({ question: questionProp }: Props) {
	const question = useFragment(GameWinnerCardFragment, questionProp)
	const isSettled =
		question.status === "RESOLVED" || question.status === "DISPUTED"
	const isLocked = question.status === "LOCKED"

	const viewerPickIds = question.viewerCall?.selections.map((s) => s.option.id)
	const highlightedOptionIds =
		viewerPickIds && viewerPickIds.length > 0
			? viewerPickIds
			: isSettled
				? question.options.filter((o) => o.isCorrect).map((o) => o.id)
				: []

	return (
		<Link
			to="/questions/$questionId/{-$slug}"
			params={{ questionId: question.id }}
			className={css({
				display: "block",
				textDecoration: "none",
				color: "inherit",
			})}
		>
			<Card interactive className={css({ borderRadius: "10px" })}>
				<Card.Body>
					<VStack gap="2.5" alignItems="stretch">
						<HStack justify="space-between" alignItems="center" gap="2">
							{question.isOfficial ? (
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
							) : (
								<span />
							)}
							{question.viewerCall !== null && <PickStateIcon state="win" />}
						</HStack>
						<span
							className={css({
								fontWeight: "bold",
								fontSize: "xl",
								lineHeight: "snug",
							})}
						>
							Who wins?
						</span>
						{isSettled ? (
							<QuestionResultBlock
								question={question}
								disputed={question.status === "DISPUTED"}
							/>
						) : (
							<VStack gap="2" alignItems="stretch">
								{question.options.map((option) => (
									<OptionRow
										key={option.id}
										label={option.label}
										fieldPct={option.fieldPct}
										count={option.callCount}
										selected={highlightedOptionIds.includes(option.id)}
									/>
								))}
							</VStack>
						)}
					</VStack>
				</Card.Body>
				<Card.Footer>
					<HStack justify="space-between" alignItems="center" width="full">
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "3xs",
								color: "fg.subtle",
							})}
						>
							{callersText(question.callCount)}
						</span>
						{isLocked ? (
							<LockedBadge />
						) : (
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "3xs",
									color: "fg.subtle",
									whiteSpace: "nowrap",
								})}
							>
								<LockLine status={question.status} locksAt={question.locksAt} />
							</span>
						)}
					</HStack>
				</Card.Footer>
			</Card>
		</Link>
	)
}
