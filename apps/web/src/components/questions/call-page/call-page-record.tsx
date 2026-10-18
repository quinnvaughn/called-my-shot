import { Link } from "@tanstack/react-router"
import { HStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { CallRecordCard } from "#/components/questions/call-record-card/call-record-card"
import type { CallRecordCardData } from "#/components/questions/call-record-card/types"
import {
	buildCallTweet,
	CallShareRow,
} from "#/components/questions/call-share-row"
import { RedoCta } from "#/components/questions/redo-cta"
import { arrowLink } from "#/components/ui/arrow-link"
import type { useMe } from "#/hooks/use-me"
import { callGifState } from "#/lib/call-gif"
import { formatPayout, marginLabel } from "#/lib/call-summary"
import type { CallRecord, CallView } from "#/lib/call-view"
import { formatGuess, isRateStat } from "#/lib/field-signal"
import { formatCallDate } from "#/lib/format-date"
import { toCallShape } from "#/lib/question-labels"
import { buildQuestionSlug } from "#/lib/slug"

type Props = {
	call: CallRecord
	view: CallView
	me: ReturnType<typeof useMe>
}

export function CallPageRecord({ call, view, me }: Props) {
	const resolved = view.points !== null && view.isWin !== null

	const cardData: CallRecordCardData = {
		name: view.name,
		username: view.username,
		avatarUrl: view.avatarUrl,
		pickLabel: view.pickLabel,
		pickSubject:
			call.selections.length === 1
				? (call.selections[0]?.option ?? null)
				: null,
		picks:
			(call.question.shape === "PLAYER_SEASON_AWARD" ||
				call.question.shape === "TEAM_SEASON_AWARD") &&
			call.selections.length > 1
				? call.selections.map((s) => ({
						label: s.option.label,
						hit: s.option.isCorrect ?? null,
						player: s.option.player,
						team: s.option.team,
					}))
				: null,
		calledAt: call.createdAt,
		isWin: view.isWin,
		points: view.points,
		inTheAir: call.payout ? formatPayout(call.payout) : null,
		fieldPct: view.fieldPct,
		closeness: view.closeness,
		// The label replaces the verdict word in the card's eyebrow; the
		// distance fills the Off by row underneath it. Only a resolved call
		// with a real gap has either.
		marginLabel:
			resolved && view.margin?.verdict
				? marginLabel(view.margin.verdict, view.isWin === true)
				: null,
		offBy:
			resolved && view.margin
				? formatGuess(view.margin.displayDistance, isRateStat(call.question))
				: null,
		actual: view.actual,
		conviction: view.conviction,
		caseText: call.caseText,
		streakLength: call.streak?.length ?? null,
		// Which reaction pool the card draws from. Derived from the same facts
		// the eyebrow above it is, so the gif and the words agree about what
		// happened - see callGifState for the two precedence rules that aren't
		// obvious.
		gifState: callGifState(view),
		questionStatus: view.questionStatus,
		pendingLabel: match(view.questionStatus)
			.with("OPEN", () => `Locks ${formatCallDate(view.locksAt)}`)
			.with("VOIDED", () => "Voided, no result")
			.with("LOCKED", "RESOLVED", "DISPUTED", () => "Awaiting result")
			.exhaustive(),
	}

	return (
		<CallRecordCard
			data={cardData}
			// The page about one call is where someone goes when they want
			// to change that call, so the offer belongs here as much as on
			// the question. The form itself lives on the question page
			// rather than being duplicated onto a page whose job is stating
			// a record.
			redo={
				<RedoCta
					questionId={call.question.id}
					offer={
						call.viewerCanRedo
							? {
									questionShape: toCallShape(call.question.shape),
									balance: me?.redoBalance ?? 0,
									unlimited: me?.isAdmin ?? false,
									action: {
										kind: "navigate",
										questionId: call.question.id,
										slug: buildQuestionSlug(call.question.title),
									},
								}
							: null
					}
				/>
			}
			footer={
				<HStack justify="space-between" gap="3" width="full">
					<Link
						to="/questions/$questionId/{-$slug}"
						params={{
							questionId: call.question.id,
							slug: buildQuestionSlug(call.question.title),
						}}
						className={arrowLink({ tone: "primary", align: "parent" })}
					>
						See the question →
					</Link>
					{me?.id === call.user.id &&
						call.question.status === "OPEN" &&
						new Date(call.question.locksAt) > new Date() && (
							<Link
								to="/challenges/new"
								search={{ question: call.question.id, source: "call" }}
								className={arrowLink({ tone: "primary", align: "parent" })}
							>
								Challenge on it →
							</Link>
						)}
					<CallShareRow
						callId={call.id}
						shareTitle={call.question.title}
						surface="call_page"
						layout="icons"
						tweetText={buildCallTweet({
							pickLabel: view.pickLabel,
							points: view.points,
							isWin: view.isWin,
							calledAt: view.calledAt,
							...(me?.id === call.user.id
								? ({ isOwn: true } as const)
								: ({ isOwn: false, username: view.username } as const)),
						})}
					/>
				</HStack>
			}
		/>
	)
}
