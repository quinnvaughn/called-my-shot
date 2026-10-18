import { Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { ReportQuestionModal } from "#/components/questions/report-question-modal"
import { UserHandle } from "#/components/users/user-handle"
import { useMe } from "#/hooks/use-me"
import { safeExternalUrl } from "#/lib/external-url"
import { MONTH_DAY_TIME_FORMAT } from "#/lib/format-date"
import { toleranceLabel } from "#/lib/question-labels"
import { toleranceSpecFrom } from "#/lib/scoring"
import { openModal } from "#/stores/modal-store"
import type { QuestionDetail } from "./types"

const factsClass = css({ textStyle: "meta", color: "fg.muted" })
const linkClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	color: "fg.subtle",
	cursor: "pointer",
	_hover: { color: "fg.muted" },
})

// How and when a community question resolves, in one line, with the ways to
// read up on resolution or report the question under it, and who made it,
// since someone made it up. An official question resolves the same way every
// time and is graded from the box score, so none of that is worth a line: it
// only gets its lock time, and only where nothing else on the page says it.
export function QuestionFacts({
	question,
	centered = false,
}: {
	question: QuestionDetail
	// Centered under GameMatchupHeader's start time, which it sits inside.
	centered?: boolean
}) {
	const me = useMe()
	const resolutionSourceUrl = safeExternalUrl(question.resolutionSourceUrl)
	const tolerance = toleranceSpecFrom(
		question.numericTolerancePct,
		question.numericToleranceAbsolute,
	)

	// Inside the matchup card the start time is already on the line above, so
	// a lock at that same moment isn't said twice.
	const locksAtStart =
		question.game != null &&
		Date.parse(question.game.startsAt) === Date.parse(question.locksAt)
	const locksLine = `Locks ${DateTime.fromISO(question.locksAt).toFormat(MONTH_DAY_TIME_FORMAT)}`

	if (question.isOfficial) {
		if (centered && locksAtStart) return null
		return (
			<span
				className={
					centered ? css({ textStyle: "meta", color: "fg.muted", textAlign: "center" }) : factsClass
				}
			>
				{locksLine}
			</span>
		)
	}

	return (
		<VStack
			gap="1"
			alignItems={centered ? "center" : "flex-start"}
			className={centered ? css({ textAlign: "center" }) : undefined}
		>
			<span className={factsClass}>
				{question.creator && (
					<>
						by <UserHandle user={question.creator} />
						{" · "}
					</>
				)}
				{!(centered && locksAtStart) && `${locksLine} · `}
				{"Resolves via "}
				{resolutionSourceUrl ? (
					<a
						href={resolutionSourceUrl}
						target="_blank"
						rel="noreferrer"
						className={css({
							textDecoration: "underline",
							textUnderlineOffset: "2px",
							_hover: { color: "fg.default" },
						})}
					>
						{question.resolutionSource}
					</a>
				) : (
					question.resolutionSource
				)}
				{tolerance && ` · Tolerance ${toleranceLabel(tolerance)}`}
			</span>
			<HStack gap="2" alignItems="center">
				<Link to="/how-it-works" hash="resolution" className={linkClass}>
					how resolution works →
				</Link>
				<span className={linkClass}>·</span>
				{question.viewerReport ? (
					<span className={linkClass}>reported, thanks</span>
				) : (
					<button
						type="button"
						onClick={() =>
							me
								? openModal(<ReportQuestionModal questionId={question.id} />)
								: openModal(<AuthModal defaultView="signin" />)
						}
						className={linkClass}
					>
						report this question
					</button>
				)}
			</HStack>
		</VStack>
	)
}
