import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match, P } from "ts-pattern"
import { MemberStateIcon } from "#/components/questions/member-state-icon"
import { NotCalledYet } from "#/components/questions/not-called-yet"
import { PickTierBadge } from "#/components/questions/pick-tier-badge"
import { PlayerOrTeamImage } from "#/components/ui/player-or-team-image"
import { Tag } from "#/components/ui/tag"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { ballotMemberState, selectionDotState } from "#/lib/ballot-member-state"
import { isContested, leadingOption } from "#/lib/contested"
import { callersText, formatGuess } from "#/lib/field-signal"
import { questionDetailState } from "#/lib/question-detail-state"
import { isNumericQuestionShape } from "#/lib/question-labels"
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
				crowdPct
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
						textStyle: "labelSm",
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
							<MemberStateIcon state={state} />
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
										<MemberStateIcon
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
										{selection.option.crowdPct !== null && (
											<PickTierBadge
												fieldPct={selection.option.crowdPct}
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
							textStyle: "meta",
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
								textStyle: "meta",
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
