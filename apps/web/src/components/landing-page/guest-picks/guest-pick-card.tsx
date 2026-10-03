import { useQuery } from "@tanstack/react-query"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { LockLine } from "#/components/questions/lock-line"
import { QuestionSummaryHeader } from "#/components/questions/question-summary-header"
import { StatContextHighlights } from "#/components/questions/stat-context-card"
import { Card } from "#/components/ui/card"
import { PlayerOrTeamImage } from "#/components/ui/player-or-team-image"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { guestPickStatContextQuery } from "#/graphql/queries/question"
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
		sport {
			id
		}
		options {
			id
			label
			fieldPct
			callCount
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
			venue
			homeTeam {
				id
				name
				abbreviation
				color
				logoUrl
			}
			awayTeam {
				id
				name
				abbreviation
				color
				logoUrl
			}
			homeTeamRecord {
				wins
				losses
				ties
				otLosses
			}
			awayTeamRecord {
				wins
				losses
				ties
				otLosses
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
	gap: "2.5",
	width: "full",
	textAlign: "left",
	borderRadius: "lg",
	padding: "{spacing.2.5} {spacing.3}",
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
	width: "4",
	height: "4",
	borderRadius: "full",
	flexShrink: "0",
	transition: "border-width 0.15s ease",
})
const radioIdleClass = css({
	border: "2px solid {colors.border.emphasized}",
})
const radioSelectedClass = css({
	border: "5px solid {colors.primary.default}",
})

const callHeadingClass = css({
	fontFamily: "mono",
	fontSize: "xs",
	letterSpacing: "wide",
	color: "fg.muted",
	textTransform: "uppercase",
})

// One question in the landing page's try-it stack. The whole card runs a size
// down from the question page's version - card padding, title, matchup, stats
// and the option rows - because it has to sit whole inside the fold next to the
// hero copy. A visitor who has to scroll to find the options doesn't know there
// are any.
//
// The matchup shows the teams and when it starts, without starters: a lineup is
// for someone already deciding, and this card is still trying to get them to
// decide anything at all. The stats are here for the visitor who wants a number
// behind the call (see StatContextHighlights), folded away because most of this
// page's traffic is meeting the product, not researching a game. Conviction
// stays off the card entirely - that's a second decision, not better input.
export function GuestPickCard({
	question: questionProp,
	pickedOptionId,
	onPick,
}: Props) {
	const question = useFragment(GuestPickCardFragment, questionProp)
	const isOverUnder = isOverUnderQuestionShape(question.shape)
	const rateStat = isRateStat(question)
	// Its own request, never folded into the landing page query: statContext
	// runs several queries per question and the stack is offered eight of them
	// per league, so it's fetched for the card on screen only. Fetched even
	// though the section starts folded, because whether there is anything worth
	// offering is only knowable from the answer.
	const statContext = useQuery(guestPickStatContextQuery(question.id))
	// Both competitors, so a game log can name the opponent - the same pair the
	// question page hands the card.
	const teamLabels = question.game
		? {
				[question.game.homeTeam.id]: question.game.homeTeam.abbreviation,
				[question.game.awayTeam.id]: question.game.awayTeam.abbreviation,
			}
		: {}

	return (
		<Card variant="surface" size="md">
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					<QuestionSummaryHeader
						question={question}
						showTypeTag
						showGame={false}
						dense
					/>
					{question.game && <GameMatchupHeader game={question.game} dense />}
					<StatContextHighlights
						statContext={statContext.data?.question?.statContext}
						teams={teamLabels}
					/>
					<VStack gap="2" alignItems="stretch">
						<span className={callHeadingClass}>Tap your call</span>
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
											leagueId: question.league.id,
											sportId: question.sport.id,
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
									<PlayerOrTeamImage
										player={option.player}
										team={option.team}
									/>
									<span
										className={css({
											flex: "1",
											fontSize: "md",
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
