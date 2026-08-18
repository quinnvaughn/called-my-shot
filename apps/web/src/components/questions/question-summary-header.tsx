import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Identity } from "#/components/ui/identity"
import { Tag } from "#/components/ui/tag"
import { TeamBadge } from "#/components/ui/team-badge"
import type {
	QuestionCategory,
	QuestionStatus,
	QuestionType,
} from "#/graphql/generated/graphql"
import { questionCategoryLabel } from "#/lib/question-labels"
import { resolvedAnswerSummary } from "#/lib/resolution-summary"
import { QuestionTypeIcon } from "./question-type-icon"
import { ResolutionBanner } from "./resolution-banner"
import { ViewerCallStatusIcon } from "./viewer-call-status-icon"

type QuestionSummaryData = {
	title: string
	type: QuestionType
	category: QuestionCategory
	isOfficial: boolean
	status: QuestionStatus
	resolutionNote: string | null
	ouLine: number | null
	numericActualValue: number | null
	options: { label: string; isCorrect: boolean | null }[]
	creator: { name: string; username: string }
	viewerCall: { id: string } | null
	league: { abbreviation: string }
	// yes_no/over_under/numeric_guess only - null for a game-wide question with
	// no single team it's about.
	subjectTeam: { abbreviation: string; color: string } | null
}

type Props = {
	question: QuestionSummaryData
	// Who put this question in front of the viewer in *this* list - QuestionCard
	// only, since CallCard's list is calls, not shares. The Shared tab this
	// comes from excludes the viewer's own shares server-side, so it's always
	// someone else's name, never "You".
	sharedBy?: { name: string }
	// CallCard puts a full caller identity row (avatar, handle, accuracy)
	// right below this header - giving the creator that same full-avatar
	// treatment reads as "two equally important people" and buries which one
	// actually made the call this card is about. Compact drops the creator to
	// a plain credit line and skips the "Called" chip, which is always true
	// on a list that's already scoped to calls (My Calls, group Answered) -
	// on QuestionCard's feed, where it's genuinely unknown, it stays.
	compact?: boolean
}

// Shared between QuestionCard and CallCard - both lead with "what is this
// question" (tags, creator, title, outcome) before getting into whatever's
// specific to that card (a lock countdown vs. a particular person's pick).
export function QuestionSummaryHeader({ question, sharedBy, compact }: Props) {
	// A dispute is only ever filed against an already-resolved question, so it
	// still carries the prior resolution's answer - just contested rather than
	// confirmed. See resolutionDisputes in db/schema/questions.ts.
	const isSettled =
		question.status === "RESOLVED" || question.status === "DISPUTED"
	const answer = isSettled ? resolvedAnswerSummary(question) : null

	return (
		<>
			{/* QuestionTypeIcon stays fixed in the top-right corner - it's its own
			flex item, never part of the wrapping group on the left. Only the
			call-status chip moved: it used to share that fixed-width right column
			with the type icon, and once it grew real text ("Make your call") it
			squeezed the tags into wrapping mid-word. It lives with the tags now,
			so it wraps along with them instead of starving them. */}
			<HStack justify="space-between" alignItems="flex-start" gap="3">
				<HStack gap="2" alignItems="center" flexWrap="wrap">
					{question.isOfficial && <Tag variant="primary">Official</Tag>}
					<Tag>{question.league.abbreviation}</Tag>
					<Tag>{questionCategoryLabel[question.category]}</Tag>
					{question.subjectTeam && (
						<TeamBadge
							abbreviation={question.subjectTeam.abbreviation}
							color={question.subjectTeam.color}
						/>
					)}
					{!compact && (
						<ViewerCallStatusIcon
							called={!!question.viewerCall}
							canCall={question.status === "OPEN"}
						/>
					)}
				</HStack>
				<QuestionTypeIcon type={question.type} />
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
			{compact ? (
				<span
					className={css({
						fontSize: "xs",
						color: "fg.subtle",
					})}
				>
					Asked by{" "}
					<span className={css({ color: "fg.muted", fontWeight: "medium" })}>
						{question.creator.name}
					</span>
				</span>
			) : (
				<Identity
					name={question.creator.name}
					username={question.creator.username}
				/>
			)}
			<span className={css({ fontWeight: "medium", fontSize: "sm" })}>
				{question.title}
			</span>
			{answer && (
				<ResolutionBanner
					answer={answer}
					note={question.resolutionNote}
					disputed={question.status === "DISPUTED"}
				/>
			)}
		</>
	)
}
