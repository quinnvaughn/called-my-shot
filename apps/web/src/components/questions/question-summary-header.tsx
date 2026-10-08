import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { questionShapeLabel } from "#/lib/question-labels"
import { BallotKicker, type BallotKickerFragment } from "./ballot-kicker"
import { GameBlock } from "./game-block"
import { PickStateIcon } from "./pick-state-icon"
import { SeriesBlock } from "./series-block"

// game is the single real-world matchup this question is about - null for
// anything not scoped to one game (season awards, an MVP race). series is the
// postseason series a series question is about.
export const QuestionSummaryHeaderFragment = graphql(`
	fragment QuestionSummaryHeader_question on Question {
		id
		title
		shape
		isOfficial
		league {
			id
			abbreviation
		}
		game {
			id
			status
			startsAt
			homeScore
			awayScore
			homeTeam {
				...Team_team @unmask
			}
			awayTeam {
				...Team_team @unmask
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
					...Team_team @unmask
				}
				awayTeam {
					...Team_team @unmask
				}
			}
		}
	}
`)

type Props = {
	question: FragmentType<typeof QuestionSummaryHeaderFragment>
	// Who put this question in front of the viewer in *this* list - QuestionCard
	// only, since CallCard's list is calls, not shares. The Shared tab this
	// comes from excludes the viewer's own shares server-side, so it's always
	// someone else's name, never "You".
	sharedBy?: { name: string }
	// QuestionCard only - CallCard already shows what kind of pick this is
	// via the pick itself, so calling out the type again here would be
	// redundant there.
	showTypeTag?: boolean
	// QuestionCard only, on an open question - see hitMultiple in
	// #/lib/scoring. Tells someone who'd otherwise skip a long-shot question
	// that a guess is cheap before they open it. Null shows nothing.
	hitMultiple?: number | null
	// QuestionCard only - whether the viewer has already made a call on this
	// question. CallCard is always about someone else's pick, so there's no
	// "did I call this" to show there.
	viewerCalled?: boolean
	// Null for the overwhelming majority of questions, which aren't part of
	// any (published) ballot. Kept out of this header's fragment so only
	// QuestionCard and CallCard show it - see BallotKicker.
	ballotMembership?: FragmentType<typeof BallotKickerFragment> | null
	// Off where the page itself already names the game or series (a game's
	// own detail page, under its GameMatchupHeader). Defaults to on.
	showGame?: boolean
	// Tighter title and spacing, for the landing page's try-it card - it sits
	// beside the hero copy and has to stay inside the fold.
	dense?: boolean
	// The top row's right end, opposite the league. CallCard puts the call's
	// standing there so it reads as the card's status rather than a note on
	// the caller's name.
	trailing?: ReactNode
}

// Shared between QuestionCard and CallCard - both lead with "what is this
// question" (sport, title, game) before getting into whatever's specific to
// that card (aggregate stats/result vs. a particular person's pick). Neither
// credits the question's creator here - CallCard leads with who CALLED it
// instead (shown separately below), and QuestionCard drops the credit line
// entirely since the title carries enough on its own.
export function QuestionSummaryHeader({
	question: questionProp,
	sharedBy,
	showTypeTag,
	hitMultiple,
	viewerCalled,
	ballotMembership,
	showGame = true,
	dense = false,
	trailing,
}: Props) {
	const question = useFragment(QuestionSummaryHeaderFragment, questionProp)
	return (
		<VStack gap={dense ? "2" : "3"} alignItems="stretch">
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
						{showTypeTag && ` · ${questionShapeLabel[question.shape]}`}
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
					{hitMultiple != null && (
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "4xs",
								fontWeight: "bold",
								letterSpacing: "wide",
								textTransform: "uppercase",
								color: "secondary.default",
								backgroundColor: "secondary.subtle",
								padding: "{spacing.0.5} {spacing.1.5}",
								borderRadius: "sm",
								whiteSpace: "nowrap",
							})}
						>
							Hits count {hitMultiple}×
						</span>
					)}
				</HStack>
				{viewerCalled && <PickStateIcon state="win" />}
				{trailing}
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
			<BallotKicker membership={ballotMembership ?? null} />
			<span
				className={css({
					fontWeight: "bold",
					fontSize: dense ? "md" : "xl",
					lineHeight: "snug",
				})}
			>
				{question.title}
			</span>
			{showGame && question.game && <GameBlock game={question.game} />}
			{showGame && question.series && <SeriesBlock series={question.series} />}
		</VStack>
	)
}
