import { Link } from "@tanstack/react-router"
import { FaCheck, FaXmark } from "react-icons/fa6"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match, P } from "ts-pattern"
import { PlayerOrTeamImage } from "#/components/ui/player-or-team-image"
import { Tag } from "#/components/ui/tag"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import {
	type BallotMemberState,
	ballotMemberState,
} from "#/lib/ballot-member-state"
import { isContested } from "#/lib/contested"
import { callersText, formatGuess } from "#/lib/field-signal"
import { questionDetailState } from "#/lib/question-detail-state"
import { isNumericQuestionShape } from "#/lib/question-labels"
import { tierFor } from "#/lib/scoring"
import { buildQuestionSlug } from "#/lib/slug"

export const PickPositionRowFragment = graphql(`
	fragment PickPositionRow_question on Question {
		id
		title
		shape
		status
		locksAt
		callCount
		options {
			id
			label
			sortOrder
			isCorrect
			fieldPct
		}
	}
`)

export const PickPositionRowCallFragment = graphql(`
	fragment PickPositionRow_call on Call {
		id
		hitTolerance
		guessValue
		closenessMult
		closenessFieldPct
		selections {
			id
			option {
				id
				label
				fieldPct
				modelHitRate
				isCorrect
				team {
					...Team_team @unmask
				}
				player {
					id
					name
					headshotUrl
				}
			}
		}
	}
`)

type PositionOption = { label: string; fieldPct: number | null }

type Props = {
	question: FragmentType<typeof PickPositionRowFragment>
	// The viewer's own call on the ballot page, the entry owner's on an entry
	// page. Null when that person hasn't called it.
	call: FragmentType<typeof PickPositionRowCallFragment> | null
	// The leading code column: a ballot member's slot, a game question's chip
	// label. Null draws the label alone.
	code: string | null
	label: string
}

const stateDotStyle: Record<BallotMemberState, string> = {
	uncalled: css({ border: "1px solid {colors.fg.subtle}" }),
	pending: css({
		backgroundColor: "fg.subtle",
		border: "1px solid {colors.fg.subtle}",
	}),
	won: css({
		backgroundColor: "success.default/15",
		border: "1px solid {colors.success.default/50}",
		color: "success.default",
	}),
	lost: css({
		backgroundColor: "danger.default/15",
		border: "1px solid {colors.danger.default/50}",
		color: "danger.default",
	}),
	missed: css({
		border: "1px dashed {colors.fg.subtle}",
		opacity: 0.5,
	}),
	voided: css({
		border: "1px solid {colors.fg.subtle}",
		opacity: 0.5,
	}),
}

// Sits inline with the pick itself ("your pick" line), not as a leading
// row-level marker - the row's actual leading element is the code/label
// column below, which every row has regardless of call state.
function PickStateDot({ state }: { state: BallotMemberState }) {
	return (
		<div
			className={cx(
				css({
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: "14px",
					height: "14px",
					borderRadius: "full",
					flexShrink: "0",
				}),
				stateDotStyle[state],
			)}
		>
			{state === "won" && <FaCheck size={8} />}
			{state === "lost" && <FaXmark size={8} />}
		</div>
	)
}

function PickTierBadge({
	fieldPct,
	totalOptions,
	modelHitRate = null,
}: {
	fieldPct: number
	totalOptions: number
	// The side's own price, when it has one - see tierFor.
	modelHitRate?: number | null
}) {
	const tier = tierFor(fieldPct, totalOptions, modelHitRate)
	return (
		<span
			className={css({
				fontFamily: "mono",
				fontSize: "3xs",
				fontWeight: "bold",
				letterSpacing: "wide",
				color: "fg.subtle",
				border: "1px solid {colors.border.default}",
				borderRadius: "sm",
				padding: "{spacing.0.5} {spacing.1.5}",
				flexShrink: "0",
			})}
		>
			{tier.label} ×{tier.mult.toFixed(1)}
		</span>
	)
}

function NotCalledYet({ state }: { state: BallotMemberState }) {
	return (
		<HStack gap="2" alignItems="center">
			<PickStateDot state={state} />
			<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
				Not called yet
			</span>
		</HStack>
	)
}

// A multi-pick question (player_season_award/team_season_award with more than
// one slot, e.g. "OF (3)") scores each selection independently - one pick
// can win while another loses on the very same call - so each gets its own
// dot rather than one shared dot standing in for the whole question.
function selectionDotState(
	isCorrect: boolean | null,
	isSettled: boolean,
): BallotMemberState {
	if (!isSettled) return "pending"
	return isCorrect ? "won" : "lost"
}

// Leading option by live fieldPct, dropping options nobody's called yet -
// same "what is the field actually saying" question isContested/rankByField
// answer, just keeping the label alongside the number for display.
function leadingOption<T extends PositionOption>(options: T[]): T | null {
	let best: T | null = null
	for (const option of options) {
		if (option.fieldPct === null) continue
		if (!best || option.fieldPct > (best.fieldPct ?? -1)) best = option
	}
	return best
}

// One question of a set someone called through (a ballot, a game's official
// questions): the pick, its tier and the field consensus the rest of the app
// already computes (packages/scoring's tierFor, QuestionOption.fieldPct). All
// of that math is reused here, not reimplemented - see #/lib/scoring
// (tierFor), #/lib/field-signal (callersText/formatGuess), #/lib/contested
// (isContested).
export function PickPositionRow({
	question: questionProp,
	call: callProp,
	code,
	label,
}: Props) {
	const question = useFragment(PickPositionRowFragment, questionProp)
	const call = useFragment(PickPositionRowCallFragment, callProp)
	const state = ballotMemberState(question, call)
	const leader = leadingOption(question.options)
	const contested = isContested(question.options, question.callCount)
	const isNumericGuess = isNumericQuestionShape(question.shape)

	return (
		<Link
			to="/questions/$questionId/{-$slug}"
			params={{
				questionId: question.id,
				slug: buildQuestionSlug(question.title),
			}}
			className={css({
				display: "flex",
				gap: "3",
				padding: "3",
				borderBottom: "1px solid {colors.border.default}",
				_hover: { backgroundColor: "bg.subtle" },
				_last: { borderBottom: "none" },
			})}
		>
			<VStack
				gap="0.5"
				alignItems="flex-start"
				width="12"
				flexShrink="0"
				paddingTop="0.5"
			>
				{code && (
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							fontWeight: "bold",
							textTransform: "uppercase",
						})}
					>
						{code}
					</span>
				)}
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "3xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: "fg.subtle",
						whiteSpace: "normal",
						lineClamp: 2,
						wordBreak: "break-word",
					})}
				>
					{label}
				</span>
			</VStack>

			<VStack gap="2" alignItems="flex-start" flex="1" minWidth="0">
				<span
					className={css({
						fontSize: "sm",
						fontWeight: "medium",
						width: "full",
					})}
				>
					{question.title}
				</span>

				{match({ isNumericGuess, call })
					.with({ call: null }, () => <NotCalledYet state={state} />)
					.with({ isNumericGuess: true }, ({ call }) => (
						<HStack gap="2" alignItems="center" flexWrap="wrap">
							<PickStateDot state={state} />
							<span className={css({ fontSize: "sm", fontWeight: "bold" })}>
								{formatGuess(call?.guessValue ?? 0)}
							</span>
							{call?.closenessFieldPct !== null &&
								call?.closenessFieldPct !== undefined && (
									<PickTierBadge
										fieldPct={call.closenessFieldPct}
										totalOptions={2}
									/>
								)}
						</HStack>
					))
					.with(P._, ({ call }) => {
						// call is guaranteed non-null here (the {call: null} branch
						// above already caught that case), and any call on a
						// non-numeric shape always carries at least one selection -
						// that's how an option-based pick is recorded in the first
						// place. The ?? [] is just for TS, not a real fallback path.
						const selections = call?.selections ?? []
						const isSettled = questionDetailState(question).isSettled
						return (
							<VStack gap="1" alignItems="flex-start">
								{selections.map((selection) => (
									<HStack key={selection.id} gap="2" alignItems="center">
										<PickStateDot
											state={selectionDotState(
												selection.option.isCorrect,
												isSettled,
											)}
										/>
										<PlayerOrTeamImage
											player={selection.option.player}
											team={selection.option.team}
										/>
										<span
											className={css({ fontSize: "sm", fontWeight: "bold" })}
										>
											{selection.option.label}
										</span>
										{selection.option.fieldPct !== null && (
											<PickTierBadge
												fieldPct={selection.option.fieldPct}
												totalOptions={question.options.length}
												modelHitRate={selection.option.modelHitRate}
											/>
										)}
									</HStack>
								))}
								{selections.length > 1 && (
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "3xs",
											letterSpacing: "wide",
											color: "fg.subtle",
										})}
									>
										EACH PICK SCORES INDEPENDENTLY
									</span>
								)}
							</VStack>
						)
					})
					.exhaustive()}

				<HStack gap="2" alignItems="center" flexWrap="wrap">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							color: "fg.subtle",
						})}
					>
						{leader
							? `Field: ${leader.label} ${Math.round(leader.fieldPct ?? 0)}%`
							: callersText(question.callCount)}
					</span>
					{leader && (
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								color: "fg.subtle",
							})}
						>
							{callersText(question.callCount)}
						</span>
					)}
					{contested && <Tag size="sm">Contested</Tag>}
				</HStack>
			</VStack>
		</Link>
	)
}
