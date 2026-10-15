import { Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { PanelRow } from "#/components/questions/panel-row"
import { ReportQuestionModal } from "#/components/questions/report-question-modal"
import { Card } from "#/components/ui/card"
import { Identity } from "#/components/ui/identity"
import { useMe } from "#/hooks/use-me"
import { safeExternalUrl } from "#/lib/external-url"
import { MONTH_DAY_TIME_FORMAT } from "#/lib/format-date"
import { toleranceLabel } from "#/lib/question-labels"
import { toleranceSpecFrom } from "#/lib/scoring"
import { openModal } from "#/stores/modal-store"
import type { QuestionDetail } from "./types"

// Who wrote the question, how and when it resolves, and the way to report it.
export function QuestionDetailsCard({
	question,
}: {
	question: QuestionDetail
}) {
	const me = useMe()
	const resolutionSourceUrl = safeExternalUrl(question.resolutionSourceUrl)
	const tolerance = toleranceSpecFrom(
		question.numericTolerancePct,
		question.numericToleranceAbsolute,
	)

	return (
		<Card>
			<Card.Body>
				<VStack gap="0" alignItems="stretch">
					<PanelRow
						label="CREATED BY"
						value={
							question.creator ? (
								<Link
									to="/user/$username"
									params={{ username: question.creator.username }}
									className={css({
										display: "inline-flex",
										minWidth: "0",
										_hover: {
											"& span:first-of-type": {
												textDecoration: "underline",
											},
										},
									})}
								>
									<Identity
										name={question.creator.name}
										username={question.creator.username}
										avatarUrl={question.creator.avatarUrl}
										stackOnMobile
									/>
								</Link>
							) : (
								<span className={css({ fontSize: "sm", color: "fg.subtle" })}>
									Deleted user
								</span>
							)
						}
					/>
					<PanelRow
						label="RESOLVES"
						value={
							resolutionSourceUrl ? (
								<a
									href={resolutionSourceUrl}
									target="_blank"
									rel="noreferrer"
									className={css({
										textDecoration: "underline",
										textUnderlineOffset: "2px",
										_hover: { color: "primary.default" },
									})}
								>
									{question.resolutionSource} ↗
								</a>
							) : (
								question.resolutionSource
							)
						}
					/>
					<PanelRow
						label="LOCKS"
						value={DateTime.fromISO(question.locksAt).toFormat(
							MONTH_DAY_TIME_FORMAT,
						)}
					/>
					{tolerance && (
						<PanelRow label="TOLERANCE" value={toleranceLabel(tolerance)} />
					)}
				</VStack>
			</Card.Body>
			<Card.Footer>
				<HStack justify="center" gap="4" width="full">
					<Link
						to="/how-it-works"
						hash="resolution"
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							color: "fg.subtle",
							_hover: { color: "fg.muted" },
						})}
					>
						how resolution works →
					</Link>
					<span
						className={css({
							textStyle: "meta",
							color: "fg.subtle",
						})}
					>
						·
					</span>
					{question.viewerReport ? (
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								letterSpacing: "wide",
								color: "fg.muted",
							})}
						>
							reported, thanks
						</span>
					) : (
						<button
							type="button"
							onClick={() =>
								me
									? openModal(<ReportQuestionModal questionId={question.id} />)
									: openModal(<AuthModal defaultView="signin" />)
							}
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								letterSpacing: "wide",
								color: "fg.subtle",
								cursor: "pointer",
								_hover: { color: "primary.default" },
							})}
						>
							report this question
						</button>
					)}
				</HStack>
			</Card.Footer>
		</Card>
	)
}
