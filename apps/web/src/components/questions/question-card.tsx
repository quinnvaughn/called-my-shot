import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { callersText, isRateStat } from "#/lib/field-signal"
import { AWAITING_RESULT_TEXT } from "#/lib/question-labels"
import { buildQuestionSlug } from "#/lib/slug"
import { CardRule } from "./card-rule"
import { LockLine } from "./lock-line"
import { LockedBadge } from "./locked-badge"
import { QuestionCardField } from "./question-card-field"
import { QuestionResultBlock } from "./question-result-block"
import { QuestionSummaryHeader } from "./question-summary-header"
import { VoidedBadge } from "./voided-badge"

export const QuestionCardFragment = graphql(`
	fragment QuestionCard_question on Question {
		id
		title
		shape
		status
		isOfficial
		locksAt
		numericActualValue
		callCount
		averageGuess
		numericToleranceAbsolute
		picksRequired
		guessDistribution {
			value
			count
		}
		stat {
			id
			toleranceTier {
				id
				toleranceMode
				toleranceValue
			}
		}
		ouLine
		league {
			id
			abbreviation
		}
		options {
			id
			label
			fieldPct
			callCount
			isCorrect
			actualValue
			team {
				id
				abbreviation
				color
				logoUrl
			}
			player {
				id
				name
				headshotUrl
			}
		}
		game {
			id
			status
			startsAt
			homeScore
			awayScore
			homeTeam {
				id
				abbreviation
				color
				logoUrl
			}
			awayTeam {
				id
				abbreviation
				color
				logoUrl
			}
		}
		series {
			id
			roundLabel
			summary
			seeds {
				teamId
				seed
			}
			gameOne {
				id
				homeTeam {
					id
					abbreviation
					color
					logoUrl
				}
				awayTeam {
					id
					abbreviation
					color
					logoUrl
				}
			}
		}
		viewerCall {
			id
			guessValue
			selections {
				id
				option {
					id
				}
			}
		}
		ballotMembership {
			id
			ballot {
				id
				name
				memberCount
				viewerCalledCount
			}
		}
	}
`)

type QuestionCardProps = {
	question: FragmentType<typeof QuestionCardFragment>
	// Who put this question in front of the viewer in *this* list - distinct
	// from the question's own creator (not shown on this card at all). Only
	// the group's Shared tab has one; every other context leaves it unset.
	sharedBy?: { name: string }
	// Off on a game's own detail page, where the matchup is already the page
	// header. Defaults to on.
	showGame?: boolean
}

export function QuestionCard({
	question: questionProp,
	sharedBy,
	showGame = true,
}: QuestionCardProps) {
	const question = useFragment(QuestionCardFragment, questionProp)
	const isSettled =
		question.status === "RESOLVED" || question.status === "DISPUTED"
	const isLocked = question.status === "LOCKED"
	const isVoided = question.status === "VOIDED"

	return (
		<Link
			to="/questions/$questionId/{-$slug}"
			params={{
				questionId: question.id,
				slug: buildQuestionSlug(question.title),
			}}
			className={css({
				display: "block",
				height: "full",
				textDecoration: "none",
				color: "inherit",
			})}
		>
			<Card
				interactive
				className={css({
					height: "full",
					borderRadius: "10px",
					paddingBlock: "1.15rem",
					paddingInline: "1.3rem",
				})}
			>
				<VStack gap="2.5" alignItems="stretch" height="full">
					<QuestionSummaryHeader
						question={question}
						sharedBy={sharedBy}
						showTypeTag
						viewerCalled={question.viewerCall !== null}
						ballotMembership={question.ballotMembership}
						showGame={showGame}
					/>
					<CardRule />
					{isSettled ? (
						<QuestionResultBlock
							question={question}
							disputed={question.status === "DISPUTED"}
						/>
					) : (
						<>
							<QuestionCardField
								shape={question.shape}
								options={question.options}
								ouLine={question.ouLine}
								isRateStat={isRateStat(question)}
								guessDistribution={question.guessDistribution}
								averageGuess={question.averageGuess}
								pickedOptionIds={
									question.viewerCall?.selections.map((s) => s.option.id) ?? []
								}
								myGuess={question.viewerCall?.guessValue ?? null}
								picksRequired={question.picksRequired}
							/>
							<HStack
								justify="space-between"
								alignItems="center"
								gap="3"
								className={css({ marginTop: "auto", paddingTop: "1" })}
							>
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "3xs",
										color: "fg.subtle",
									})}
								>
									{callersText(question.callCount)}
									{isLocked && ` · ${AWAITING_RESULT_TEXT}`}
								</span>
								{isLocked ? (
									<LockedBadge />
								) : isVoided ? (
									<VoidedBadge />
								) : (
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "3xs",
											color: "fg.subtle",
											whiteSpace: "nowrap",
										})}
									>
										<LockLine
											status={question.status}
											locksAt={question.locksAt}
										/>
									</span>
								)}
							</HStack>
						</>
					)}
				</VStack>
			</Card>
		</Link>
	)
}
