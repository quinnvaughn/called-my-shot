import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import type { GameStatus, QuestionShape } from "#/graphql/generated/graphql"
import { questionShapeLabel } from "#/lib/question-labels"
import { BallotKicker, type BallotMembership } from "./ballot-kicker"
import { GameBlock } from "./game-block"
import { PickStateIcon } from "./pick-state-icon"
import { SeriesBlock, type SeriesBlockData } from "./series-block"

type QuestionSummaryData = {
	title: string
	shape: QuestionShape
	isOfficial: boolean
	league: { abbreviation: string }
	// The single real-world matchup this question is about - null for
	// anything not scoped to one game (season awards, an MVP race).
	game: {
		status: GameStatus
		startsAt: string
		homeScore: number | null
		awayScore: number | null
		homeTeam: { abbreviation: string; color: string; logoUrl?: string | null }
		awayTeam: { abbreviation: string; color: string; logoUrl?: string | null }
	} | null
	// The postseason series a series question is about. Optional because not
	// every fragment feeding this header asks for it.
	series?: SeriesBlockData | null
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
	// Null for the overwhelming majority of questions, which aren't part of
	// any (published) ballot. QuestionCard and CallCard each pass their own
	// colocated fragment's ballotMembership straight through - see BallotKicker.
	ballotMembership?: BallotMembership
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
	question,
	sharedBy,
	showTypeTag,
	viewerCalled,
	ballotMembership,
	showGame = true,
	dense = false,
	trailing,
}: Props) {
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
