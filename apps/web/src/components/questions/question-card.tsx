import { Link, useNavigate } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { callersText, isRateStat } from "#/lib/field-signal"
import {
	AWAITING_RESULT_TEXT,
	isNumericQuestionShape,
	toCallShape,
} from "#/lib/question-labels"
import {
	DEFAULT_CONVICTION,
	hitMultiple,
	optionPointsPreview,
} from "#/lib/scoring"
import { buildQuestionSlug } from "#/lib/slug"
import { CardRule } from "./card-rule"
import { castCallBucketFor } from "./cast-call-form/use-cast-call-form"
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
		locksAt
		numericActualValue
		callCount
		averageGuess
		numericToleranceAbsolute
		picksRequired
		lossRate
		isOfficial
		isPriced
		fieldConviction
		viewerSeasonPlay {
			weight
		}
		seriesStage {
			weight
		}
		seasonGamesPlayed
		seasonTotalGames
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
		options {
			id
			label
			fieldPct
			callCount
			convictionTotal
			lossRate
			winMult
			modelHitRate
			isCorrect
			actualValue
			team {
				...Team_team @unmask
			}
			player {
				id
				name
				headshotUrl
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
			...BallotKicker_membership
		}
		...QuestionSummaryHeader_question
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
	// The top row's right end - the game page's streak tag.
	trailing?: ReactNode
	// Under the options while the question is open or locked - the game page's
	// line of recent form and group picks.
	context?: ReactNode
	// Each option row opens the question with that side already picked, so a
	// tap on the side someone likes still lands them on the stats and the
	// conviction slider before it counts. Only while one tap is the whole
	// pick: an open, uncalled, single-pick question.
	pickable?: boolean
}

export function QuestionCard({
	question: questionProp,
	sharedBy,
	showGame = true,
	trailing,
	context,
	pickable = false,
}: QuestionCardProps) {
	const question = useFragment(QuestionCardFragment, questionProp)
	const navigate = useNavigate()
	const isSettled =
		question.status === "RESOLVED" || question.status === "DISPUTED"
	const isLocked = question.status === "LOCKED"
	const isVoided = question.status === "VOIDED"
	// Only while it can still be called: once locked it's no longer a reason
	// to take a guess.
	const multiple =
		question.status === "OPEN"
			? hitMultiple(question.lossRate, question.options)
			: null

	// What each side pays at the conviction a call starts at, so the sides can
	// be compared before the question is opened.
	const showsPoints =
		question.status === "OPEN" && !isNumericQuestionShape(question.shape)
	const pointsFor = showsPoints
		? (optionId: string) => {
				const option = question.options.find((o) => o.id === optionId)
				return option
					? optionPointsPreview(
							question,
							option,
							question.options.length,
							DEFAULT_CONVICTION,
						)
					: { win: 0, lose: 0 }
			}
		: undefined

	// A numeric guess needs a typed number and a multi-pick award several
	// picks, so only a question one tap fully answers starts from a row.
	const canPick =
		pickable &&
		question.status === "OPEN" &&
		question.viewerCall === null &&
		castCallBucketFor(
			toCallShape(question.shape),
			question.picksRequired ?? 1,
		) === "single"
	const params = {
		questionId: question.id,
		slug: buildQuestionSlug(question.title),
	}

	return (
		<Link
			to="/questions/$questionId/{-$slug}"
			params={params}
			// The whole card is the one link, since rows can't be buttons or
			// links of their own inside it. A plain tap on a row goes to the same
			// page with that row's option picked; a modified click (new tab) is
			// left to the link.
			onClick={(event) => {
				if (!canPick) return
				if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
					return
				const row =
					event.target instanceof Element
						? event.target.closest<HTMLElement>("[data-option-target]")
						: null
				const pick = row?.dataset.optionTarget
				if (!pick) return
				event.preventDefault()
				void navigate({
					to: "/questions/$questionId/{-$slug}",
					params,
					state: { pick },
					// The question page puts the viewer on its form itself, before
					// it paints. A reset to the top first would show as a jump.
					resetScroll: false,
				})
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
						hitMultiple={multiple}
						viewerCalled={question.viewerCall !== null}
						ballotMembership={question.ballotMembership}
						showGame={showGame}
						trailing={trailing}
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
								pointsFor={pointsFor}
								pickable={canPick}
							/>
							{context}
							<HStack
								justify="space-between"
								alignItems="center"
								gap="3"
								className={css({ marginTop: "auto", paddingTop: "1" })}
							>
								<span
									className={css({
										textStyle: "metaSm",
										color: "fg.subtle",
									})}
								>
									{callersText(question.callCount)}
									{isLocked && ` · ${AWAITING_RESULT_TEXT}`}
									{showsPoints &&
										` · points at ${DEFAULT_CONVICTION}% conviction`}
								</span>
								{isLocked ? (
									<LockedBadge />
								) : isVoided ? (
									<VoidedBadge />
								) : (
									<span
										className={css({
											textStyle: "metaSm",
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
