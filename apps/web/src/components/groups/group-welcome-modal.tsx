import { useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import {
	CastCallForm,
	FORM_ID,
	useCastCallForm,
} from "#/components/questions/cast-call-form"
import {
	type CalledPick,
	castCallBucketFor,
	type QuestionCallShape,
} from "#/components/questions/cast-call-form/use-cast-call-form"
import { FadeCallForm } from "#/components/questions/fade-call-modal"
import { LockLine } from "#/components/questions/lock-line"
import { QuestionSummaryHeader } from "#/components/questions/question-summary-header"
import {
	StatContextCard,
	StatContextHighlights,
} from "#/components/questions/stat-context-card"
import { Avatar } from "#/components/ui/avatar"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { GroupLogo } from "#/components/ui/group-logo"
import { Modal } from "#/components/ui/modal"
import { graphql } from "#/graphql/generated"
import type {
	GroupDetailQuery,
	GroupWelcomeQuery,
} from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { DismissGroupWelcomeDocument } from "#/graphql/mutations/groups"
import { guestPickStatContextQuery } from "#/graphql/queries/question"
import { gqlQueryOptions } from "#/graphql/query-options"
import { track } from "#/lib/analytics"
import { type CallSummaryData, pickSummary } from "#/lib/call-summary"
import { formatGuess, isRateStat } from "#/lib/field-signal"
import { pluralize } from "#/lib/pluralize"
import {
	isOverUnderQuestionShape,
	optionDisplayLabel,
} from "#/lib/question-labels"
import { alignmentText, compareWithInviter } from "#/lib/welcome-alignment"
import { closeModal } from "#/stores/modal-store"

const GroupWelcomeDocument = graphql(`
	query GroupWelcome($groupId: ID!) {
		group(id: $groupId) {
			id
			name
			logoUrl
			bannerUrl
			welcomeMessage
			welcome {
				source
				memberCallCount
				otherPinnedCount
				inviter {
					id
					username
					name
					avatarUrl
				}
				question {
					id
					title
					shape
					status
					isOfficial
					locksAt
					picksRequired
					ouLine
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
							id
							abbreviation
							color
							logoUrl
						}
						awayTeam {
							id
							abbreviation
							color
							logoUrl
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
								id
								abbreviation
								color
								logoUrl
							}
							awayTeam {
								id
								abbreviation
								color
								logoUrl
							}
						}
					}
					numericActualValue
					numericToleranceAbsolute
					numericTolerancePct
					stat {
						toleranceTier {
							toleranceMode
							toleranceValue
						}
					}
					...CastCallForm_question
				}
				inviterCall {
					id
					guessValue
					conviction
					totalPoints
					selections {
						id
						conviction
						option {
							id
							label
							isCorrect
						}
					}
					fadeOffer {
						mode
						option {
							id
							label
						}
					}
				}
			}
		}
	}
`)

type WelcomeGroup = NonNullable<GroupWelcomeQuery["group"]>
type Welcome = NonNullable<WelcomeGroup["welcome"]>
type WelcomeQuestion = NonNullable<Welcome["question"]>

const eyebrowClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "fg.subtle",
})

const noteClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	color: "fg.subtle",
})

// Shown to a member the first time they open a group after joining: who
// brought them in, the admins' welcome message, and one question they can
// choose to call, with their inviter's pick on it. The group page opens it while
// the member hasn't been welcomed yet. Closing it, skipping it, or making the
// call marks them welcomed; leaving the page with it still open doesn't, so
// it's there again next visit.
export function GroupWelcomeModal({ groupId }: { groupId: string }) {
	const { data, isPending } = useQuery(
		gqlQueryOptions(GroupWelcomeDocument, { groupId }, { abortable: false }),
	)
	const markWelcomed = useMarkWelcomed(groupId)

	function finish() {
		markWelcomed()
		closeModal()
	}

	return (
		<Modal size="lg" onClose={markWelcomed}>
			<Modal.CloseButton />
			{isPending ? (
				<p className={css({ fontSize: "sm", color: "fg.subtle" })}>Loading…</p>
			) : data?.group?.welcome ? (
				<WelcomeBody
					initial={data.group}
					welcome={data.group.welcome}
					onCalled={markWelcomed}
					onFinish={finish}
				/>
			) : (
				<FormError message="This group couldn't be loaded." />
			)}
		</Modal>
	)
}

// offer: the welcome and a look at the question, with the choice to call it.
// call/fade: the form, once they've opted in. done: how it lined up.
type Step = "offer" | "call" | "fade" | "done"

function WelcomeBody({
	initial,
	welcome: initialWelcome,
	onCalled: onCallLanded,
	onFinish,
}: {
	initial: WelcomeGroup
	welcome: Welcome
	onCalled: () => void
	// Marks the member welcomed and closes the modal.
	onFinish: () => void
}) {
	// Frozen at first load: a landed call refetches every query, and the
	// refetched welcome would offer a different question (this one's been
	// called) out from under the step that follows it.
	const [group] = useState(initial)
	const [welcome] = useState(initialWelcome)
	const [step, setStep] = useState<Step>("offer")
	const [myPick, setMyPick] = useState<CalledPick | null>(null)
	useTrackWelcomeViewed(group.id, welcome)

	const question = welcome.question
	const inviter = welcome.inviter

	function onCalled(pick: CalledPick) {
		onCallLanded()
		setMyPick(pick)
		setStep("done")
	}

	return (
		<VStack gap="5" alignItems="stretch">
			{group.bannerUrl && (
				<img
					src={group.bannerUrl}
					alt=""
					className={css({
						width: "full",
						height: "24",
						objectFit: "cover",
						borderRadius: "lg",
					})}
				/>
			)}
			<HStack gap="3" alignItems="center">
				<GroupLogo name={group.name} src={group.logoUrl} />
				<VStack gap="1" alignItems="flex-start" minWidth="0">
					<Modal.Title>Welcome to {group.name}</Modal.Title>
					{inviter && (
						<HStack gap="1.5" alignItems="center">
							<Avatar size="sm" name={inviter.name} src={inviter.avatarUrl} />
							<span className={css({ fontSize: "sm", color: "fg.muted" })}>
								@{inviter.username} brought you in
							</span>
						</HStack>
					)}
				</VStack>
			</HStack>
			{group.welcomeMessage && (
				<p
					className={css({
						fontSize: "sm",
						whiteSpace: "pre-wrap",
						backgroundColor: "bg.canvas",
						borderRadius: "md",
						paddingBlock: "3",
						paddingInline: "3.5",
					})}
				>
					{group.welcomeMessage}
				</p>
			)}
			{question ? (
				match(step)
					.with("offer", () => (
						<OfferStep
							welcome={welcome}
							question={question}
							onAccept={() => setStep("call")}
							onDecline={onFinish}
						/>
					))
					.with("call", () => (
						<CallStep
							groupId={group.id}
							welcome={welcome}
							question={question}
							onFade={() => setStep("fade")}
							onCalled={onCalled}
							onBack={() => setStep("offer")}
						/>
					))
					.with("fade", () => (
						<FadeStep
							groupId={group.id}
							welcome={welcome}
							question={question}
							onBack={() => setStep("call")}
							onCalled={onCalled}
						/>
					))
					.with("done", () => (
						<DoneStep
							welcome={welcome}
							question={question}
							myPick={myPick}
							onFinish={onFinish}
						/>
					))
					.exhaustive()
			) : (
				<VStack gap="3" alignItems="stretch">
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						Nothing in this group's leagues is open to call right now. The
						leaderboard and everyone's calls are on the group page.
					</p>
					<Button variant="solid" size="lg" fullWidth onClick={onFinish}>
						Go to the group
					</Button>
				</VStack>
			)}
		</VStack>
	)
}

// Marks the member welcomed to this group, once however many ways the modal
// is closed. Also flips the group page's cached flag so nothing reopens it.
function useMarkWelcomed(groupId: string) {
	const dismiss = useGqlMutation(DismissGroupWelcomeDocument)
	const queryClient = useQueryClient()
	const marked = useRef(false)

	return () => {
		if (marked.current) return
		marked.current = true
		queryClient.setQueriesData<GroupDetailQuery>(
			{ queryKey: ["GroupDetail"] },
			(old) =>
				old?.group?.id === groupId
					? { ...old, group: { ...old.group, viewerDismissedWelcome: true } }
					: old,
		)
		dismiss.mutate({ groupId })
	}
}

function useTrackWelcomeViewed(groupId: string, welcome: Welcome) {
	const tracked = useRef(false)

	// biome-ignore lint/correctness/useExhaustiveDependencies: once per mount
	useEffect(() => {
		if (tracked.current) return
		tracked.current = true
		track("group_welcome_viewed", {
			groupId,
			questionSource: match(welcome.source)
				.with("PINNED", () => "pinned" as const)
				.with("SUGGESTED", () => "suggested" as const)
				.with(null, () => "none" as const)
				.exhaustive(),
			hasInviterCall: welcome.inviterCall != null,
		})
	}, [])
}

// The inviter's call in the shape pickSummary reads.
function inviterSummary(
	welcome: Welcome,
	question: WelcomeQuestion,
): CallSummaryData | null {
	const call = welcome.inviterCall
	if (!call) return null
	return {
		guessValue: call.guessValue ?? null,
		conviction: call.conviction ?? null,
		totalPoints: call.totalPoints ?? null,
		question: {
			shape: question.shape,
			ouLine: question.ouLine ?? null,
			numericActualValue: question.numericActualValue ?? null,
			numericToleranceAbsolute: question.numericToleranceAbsolute ?? null,
			numericTolerancePct: question.numericTolerancePct ?? null,
			stat: question.stat
				? { toleranceTier: question.stat.toleranceTier ?? null }
				: null,
		},
		selections: call.selections.map((s) => ({
			id: s.id,
			conviction: s.conviction,
			option: { label: s.option.label, isCorrect: s.option.isCorrect ?? null },
		})),
	}
}

// What the question is, and when it closes: the league, the title, the
// game or series it's about, and the lock countdown. The same header the
// question cards use, so it reads the way questions do everywhere else.
function QuestionHeading({
	eyebrow,
	question,
}: {
	eyebrow: string
	question: WelcomeQuestion
}) {
	return (
		<VStack gap="2" alignItems="stretch">
			<span className={eyebrowClass}>{eyebrow}</span>
			<QuestionSummaryHeader question={question} />
			<span className={noteClass}>
				<LockLine status={question.status} locksAt={question.locksAt} />
			</span>
		</VStack>
	)
}

const linkButtonClass = css({
	fontFamily: "mono",
	fontSize: "xs",
	color: "fg.muted",
	cursor: "pointer",
	_hover: { color: "fg.default" },
})

// "@jordan took Over 52.5", with room for an action beside it.
function InviterPick({
	welcome,
	question,
	action,
}: {
	welcome: Welcome
	question: WelcomeQuestion
	action?: ReactNode
}) {
	const inviter = welcome.inviter
	const summary = inviterSummary(welcome, question)
	if (!inviter || !summary) return null
	return (
		<HStack
			justify="space-between"
			gap="3"
			className={css({
				backgroundColor: "bg.canvas",
				borderRadius: "md",
				paddingBlock: "2.5",
				paddingInline: "3.5",
			})}
		>
			<span className={css({ fontSize: "sm" })}>
				@{inviter.username} took <b>{pickSummary(summary)}</b>
			</span>
			{action}
		</HStack>
	)
}

function MemberCallCount({ welcome }: { welcome: Welcome }) {
	if (welcome.memberCallCount === 0) return null
	return (
		<span className={noteClass}>
			{welcome.memberCallCount} {pluralize(welcome.memberCallCount, "member")}{" "}
			already called this
		</span>
	)
}

// Both competitors, so a game log can name the opponent - the same pair the
// question page hands the stat cards.
function teamLabelsFor(question: WelcomeQuestion): Record<string, string> {
	return question.game
		? {
				[question.game.homeTeam.id]: question.game.homeTeam.abbreviation,
				[question.game.awayTeam.id]: question.game.awayTeam.abbreviation,
			}
		: {}
}

// The recent numbers and the viewer's own record on this stat, the same card
// the question page puts directly above its pick form. Shares its cache entry
// with the preview's highlights, so it's usually loaded by the time they opt in.
function WelcomeStatContext({ question }: { question: WelcomeQuestion }) {
	const statContext = useQuery(guestPickStatContextQuery(question.id))
	return (
		<StatContextCard
			statContext={statContext.data?.question?.statContext}
			trackRecord={statContext.data?.question?.viewerTrackRecord}
			teams={teamLabelsFor(question)}
			isCallable
		/>
	)
}

// The question as a preview, so a new member sees what it is and who in the
// group has called it before deciding whether to call it themselves.
function OfferStep({
	welcome,
	question,
	onAccept,
	onDecline,
}: {
	welcome: Welcome
	question: WelcomeQuestion
	onAccept: () => void
	onDecline: () => void
}) {
	const statContext = useQuery(guestPickStatContextQuery(question.id))

	return (
		<VStack gap="4" alignItems="stretch">
			<VStack
				gap="3"
				alignItems="stretch"
				className={css({
					border: "1px solid {colors.border.default}",
					borderRadius: "lg",
					padding: "4",
				})}
			>
				<QuestionHeading
					eyebrow={
						welcome.source === "PINNED"
							? "Pinned by the admins"
							: "Open in the group"
					}
					question={question}
				/>
				<StatContextHighlights
					statContext={statContext.data?.question?.statContext}
					teams={teamLabelsFor(question)}
				/>
				<InviterPick welcome={welcome} question={question} />
				<MemberCallCount welcome={welcome} />
			</VStack>
			<p
				className={css({
					fontSize: "sm",
					color: "fg.muted",
					textAlign: "center",
				})}
			>
				{welcome.inviter && welcome.inviterCall
					? `@${welcome.inviter.username} already called it, so when it scores you'll see which of you read it right. It counts toward the group leaderboard either way.`
					: "Why not kick things off with this one? It's your first shot at the group leaderboard."}
			</p>
			<VStack gap="2" alignItems="stretch">
				<Button variant="solid" size="lg" fullWidth onClick={onAccept}>
					Make the call
				</Button>
				<HStack justify="space-between" gap="3">
					<span className={noteClass}>
						{welcome.otherPinnedCount > 0
							? `${welcome.otherPinnedCount} more pinned on the group page`
							: ""}
					</span>
					<button type="button" onClick={onDecline} className={linkButtonClass}>
						Not now
					</button>
				</HStack>
			</VStack>
		</VStack>
	)
}

function CallStep({
	groupId,
	welcome,
	question,
	onFade,
	onCalled,
	onBack,
}: {
	groupId: string
	welcome: Welcome
	question: WelcomeQuestion
	onFade: () => void
	onCalled: (pick: CalledPick) => void
	onBack: () => void
}) {
	const callForm = useCastCallForm(question, {
		surface: "group_welcome",
		welcomeGroupId: groupId,
		closeOnSuccess: false,
		onCalled,
	})
	const { form } = callForm
	const inviter = welcome.inviter
	const canFade = welcome.inviterCall?.fadeOffer?.mode === "NEW"

	return (
		<VStack gap="4" alignItems="stretch">
			<QuestionHeading eyebrow="Your first call" question={question} />
			<InviterPick
				welcome={welcome}
				question={question}
				action={
					canFade && inviter ? (
						<Button variant="outline" size="sm" onClick={onFade}>
							Fade @{inviter.username}
						</Button>
					) : undefined
				}
			/>
			<MemberCallCount welcome={welcome} />
			<WelcomeStatContext question={question} />
			<CastCallForm callForm={callForm} />
			<form.Subscribe selector={(s) => s.meta}>
				{(meta) => (
					<VStack gap="2" alignItems="stretch">
						<Button
							type="submit"
							form={FORM_ID}
							variant="solid"
							size="lg"
							fullWidth
							loading={meta.isSubmitting}
							disabled={meta.isSubmitting || !meta.canSubmit}
						>
							Lock It In
						</Button>
						<FormError message={meta.formError} />
					</VStack>
				)}
			</form.Subscribe>
			<button
				type="button"
				onClick={onBack}
				className={cx(linkButtonClass, css({ alignSelf: "center" }))}
			>
				Back
			</button>
		</VStack>
	)
}

function FadeStep({
	groupId,
	welcome,
	question,
	onBack,
	onCalled,
}: {
	groupId: string
	welcome: Welcome
	question: WelcomeQuestion
	onBack: () => void
	onCalled: (pick: CalledPick) => void
}) {
	const call = welcome.inviterCall
	const offer = call?.fadeOffer
	const summary = inviterSummary(welcome, question)
	if (!call || !offer || !welcome.inviter || !summary) return null
	const isOverUnder = isOverUnderQuestionShape(question.shape)

	return (
		<VStack gap="4" alignItems="stretch">
			<QuestionHeading eyebrow="Your first call" question={question} />
			<WelcomeStatContext question={question} />
			<FadeCallForm
				question={question}
				surface="group_welcome"
				welcomeGroupId={groupId}
				closeOnSuccess={false}
				onCalled={onCalled}
				callId={call.id}
				optionId={offer.option.id}
				opUsername={welcome.inviter.username}
				opPickLabel={pickSummary(summary)}
				pickLabel={optionDisplayLabel(
					offer.option.label,
					isOverUnder,
					question.ouLine ?? null,
					isRateStat(question),
				)}
			/>
			<button
				type="button"
				onClick={onBack}
				className={css({
					alignSelf: "center",
					fontFamily: "mono",
					fontSize: "xs",
					color: "fg.muted",
					cursor: "pointer",
					_hover: { color: "fg.default" },
				})}
			>
				Back
			</button>
		</VStack>
	)
}

function DoneStep({
	welcome,
	question,
	myPick,
	onFinish,
}: {
	welcome: Welcome
	question: WelcomeQuestion
	myPick: CalledPick | null
	onFinish: () => void
}) {
	const inviter = welcome.inviter
	const call = welcome.inviterCall
	const summary = inviterSummary(welcome, question)
	const bucket = castCallBucketFor(
		question.shape.toLowerCase() as QuestionCallShape,
		question.picksRequired ?? 1,
	)

	const line =
		inviter && call && summary && myPick
			? alignmentText(
					compareWithInviter(
						myPick,
						{
							optionIds: call.selections.map((s) => s.option.id),
							guessValue: call.guessValue ?? null,
						},
						bucket,
					),
					inviter.username,
					pickSummary(summary),
					(value) => formatGuess(value, isRateStat(question)),
				)
			: null

	return (
		<VStack gap="4" alignItems="stretch">
			<QuestionHeading eyebrow="Your first call" question={question} />
			<VStack
				gap="1.5"
				alignItems="flex-start"
				className={css({
					backgroundColor: "bg.canvas",
					borderRadius: "md",
					paddingBlock: "3",
					paddingInline: "3.5",
				})}
			>
				<span className={css({ fontSize: "sm", fontWeight: "bold" })}>
					Your call is in.
				</span>
				<span className={css({ fontSize: "sm", color: "fg.muted" })}>
					{line ??
						"The rest of the group sees it in their Answered tab, and it counts on the group leaderboard once it scores."}
				</span>
			</VStack>
			<Button variant="solid" size="lg" fullWidth onClick={onFinish}>
				Go to the group
			</Button>
		</VStack>
	)
}
