import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { PossiblePoints } from "#/components/challenges/possible-points"
import { useAcceptChallenge } from "#/components/challenges/use-accept-challenge"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { CardRule } from "#/components/questions/card-rule"
import {
	type CallDraft,
	CastCallForm,
	CastCallFormFragment,
	useCastCallForm,
} from "#/components/questions/cast-call-form"
import { PickList } from "#/components/questions/pick-list"
import { QuestionSummaryHeader } from "#/components/questions/question-summary-header"
import { StatContextCard } from "#/components/questions/stat-context-card"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { Button, button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FormError } from "#/components/ui/form-error"
import { NotFound } from "#/components/ui/not-found"
import { useFragment as unmask } from "#/graphql/generated"
import type { ChallengePageQuery } from "#/graphql/generated/graphql"
import { challengePageQuery } from "#/graphql/queries/challenges"
import { questionStatContextQuery } from "#/graphql/queries/question"
import { useRequireAuth } from "#/hooks/use-require-auth"
import {
	type ChallengePointsRange,
	challengePointsRange,
	draftSummary,
	singleGameOf,
	teamLabelsOf,
	toPicks,
} from "#/lib/challenge"
import { pluralize } from "#/lib/pluralize"

type Search = { step?: number; review?: true }

// Taking a challenge on: one question per screen, then a review of every
// call, then one send. Calls are held in storage until then, so a visitor
// can make them all before signing up.
export const Route = createFileRoute("/_app/challenges/$code_/play")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown>): Search => ({
		...(typeof search.step === "number" && search.step > 0
			? { step: search.step }
			: {}),
		...(search.review === true || search.review === "true"
			? { review: true as const }
			: {}),
	}),
	loader: ({ context, params }) =>
		context.queryClient.query(challengePageQuery(params.code)),
})

type Challenge = NonNullable<ChallengePageQuery["challenge"]>
type Entry = Challenge["entries"][number]

const dotBase = css({ width: "2.5", height: "2.5", borderRadius: "full" })
const dotDone = css({
	backgroundColor: "primary.default",
	border: "1px solid {colors.primary.default}",
})
const dotCurrent = css({
	backgroundColor: "transparent",
	border: "2px solid {colors.primary.default}",
})
const dotIdle = css({
	backgroundColor: "transparent",
	border: "2px solid {colors.border.emphasized}",
})

const sideLabel = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "fg.subtle",
})

function RouteComponent() {
	const { code } = Route.useParams()
	const { data } = useSuspenseQuery(challengePageQuery(code))
	const { me } = Route.useRouteContext()
	const challenge = data.challenge

	if (!challenge) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Challenge"
				heading="This challenge doesn't exist"
				subtitle="Check the link with whoever sent it."
				link={{ text: "Back to home", url: "/home" }}
			/>
		)
	}
	if (!challenge.viewerCanAccept || me?.id === challenge.creator.id) {
		return (
			<VStack
				gap="3"
				alignItems="center"
				className={css({ paddingTop: "16", textAlign: "center" })}
			>
				<h1 className={css({ fontFamily: "heading", fontSize: "2xl" })}>
					{challenge.viewerMatchup
						? "You've already taken this one on"
						: "This challenge isn't taking people"}
				</h1>
				<p className={css({ fontSize: "sm", color: "fg.muted" })}>
					A challenge closes when its first question locks.
				</p>
				<Link
					to="/challenges/$code"
					params={{ code: challenge.code }}
					className={button({ variant: "solid", size: "md" })}
				>
					See the challenge
				</Link>
			</VStack>
		)
	}
	return <Play challenge={challenge} />
}

function Play({ challenge }: { challenge: Challenge }) {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const { me } = Route.useRouteContext()
	const requireAuth = useRequireAuth()
	const creator = challenge.creator
	const missing = challenge.entries.filter((e) =>
		challenge.viewerMissingQuestionIds.includes(e.question.id),
	)
	const game = singleGameOf(challenge.entries.map((e) => e.question))

	const accept = useAcceptChallenge({
		challengeId: challenge.id,
		code: challenge.code,
		missingQuestionIds: challenge.viewerMissingQuestionIds,
		questionCount: challenge.entries.length,
		onAccepted: () =>
			navigate({ to: "/challenges/$code", params: { code: challenge.code } }),
	})

	const reviewing = search.review === true || missing.length === 0
	const step = Math.min(search.step ?? 0, Math.max(missing.length - 1, 0))
	const current = missing[step]

	const goTo = (next: number | "review") =>
		navigate({
			search:
				next === "review" ? { review: true } : next > 0 ? { step: next } : {},
		})

	// Coming back signed in (a Google sign-in leaves the page) with every
	// call already made sends them straight away.
	const resumed = useRef(false)
	// biome-ignore lint/correctness/useExhaustiveDependencies: once, on arrival signed in
	useEffect(() => {
		if (resumed.current || !me || !reviewing || !accept.loaded) return
		if (!accept.complete || missing.length === 0) return
		resumed.current = true
		void accept.send()
	}, [me?.id, accept.loaded])

	function lockIn() {
		requireAuth(() => void accept.send(), {
			signup: {
				title: `Sign up to take on @${creator.username}`,
				description:
					"Your calls are saved. Create a free account and they all go in together.",
			},
			signin: {
				title: `Sign in to take on @${creator.username}`,
				description: "Your calls are saved and go in once you're signed in.",
			},
		})
	}

	return (
		<VStack gap="5" alignItems="stretch" className={css({ paddingTop: "6" })}>
			<Breadcrumb>
				{me && <Breadcrumb.Link to="/challenges">Challenges</Breadcrumb.Link>}
				<Breadcrumb.Link
					to="/challenges/$code"
					params={{ code: challenge.code }}
				>
					@{creator.username}'s challenge
				</Breadcrumb.Link>
				<Breadcrumb.Current>Take it on</Breadcrumb.Current>
			</Breadcrumb>

			<HStack justify="space-between" gap="4" alignItems="flex-end">
				<VStack gap="1" alignItems="flex-start">
					<h1
						className={css({
							fontFamily: "heading",
							fontSize: { base: "2xl", md: "3xl" },
							lineHeight: "tight",
						})}
					>
						{reviewing ? "Your calls" : `Take on @${creator.username}`}
					</h1>
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						{reviewing
							? "Check them over. They all go in together and can't be changed after, the same as any call. Points are what each call counts for in the 1v1, without the early bonus or season pace."
							: "Make your call on each one. Nothing goes in until you've made them all."}
					</p>
				</VStack>
				{missing.length > 1 && (
					<VStack gap="1.5" alignItems="flex-end" flexShrink="0">
						<span className={css({ fontFamily: "mono", fontSize: "sm" })}>
							{reviewing ? "Review" : `${step + 1} of ${missing.length}`}
						</span>
						<HStack gap="1.5">
							{missing.map((e, i) => (
								<span
									key={e.question.id}
									className={cx(
										dotBase,
										!reviewing && i === step
											? dotCurrent
											: accept.drafts[e.question.id]
												? dotDone
												: dotIdle,
									)}
								/>
							))}
						</HStack>
					</VStack>
				)}
			</HStack>

			{game && <GameMatchupHeader game={game} dense />}

			{reviewing ? (
				<Review
					challenge={challenge}
					showGame={!game}
					drafts={accept.drafts}
					onEdit={(index) => goTo(index)}
				/>
			) : current && accept.loaded ? (
				<StepForm
					key={current.question.id}
					entry={current}
					creatorUsername={creator.username}
					showGame={!game}
					initial={accept.drafts[current.question.id]}
					isFirst={step === 0}
					isLast={step === missing.length - 1}
					onBack={() => goTo(step - 1)}
					onSave={(draft) => {
						accept.saveDraft(current.question.id, draft)
						goTo(step === missing.length - 1 ? "review" : step + 1)
					}}
				/>
			) : null}

			{reviewing && (
				<VStack gap="2" alignItems="stretch">
					<Button
						variant="solid"
						size="lg"
						fullWidth
						disabled={!accept.complete || accept.sending}
						loading={accept.sending}
						onClick={lockIn}
					>
						{missing.length > 0
							? `Lock in ${missing.length} ${pluralize(missing.length, "call")} and take on @${creator.username}`
							: `Take on @${creator.username}`}
					</Button>
					<FormError message={accept.error} />
				</VStack>
			)}
		</VStack>
	)
}

// What the creator called, above the form, so the viewer is calling against
// something they can see.
function CreatorCall({
	username,
	call,
}: {
	username: string
	call: Entry["creatorCall"]
}) {
	return (
		<VStack
			gap="2"
			alignItems="stretch"
			className={css({
				padding: "3",
				borderRadius: "lg",
				backgroundColor: "bg.subtle",
			})}
		>
			<span className={sideLabel}>@{username}'s call</span>
			{call ? (
				<PickList call={call} />
			) : (
				<p className={css({ fontSize: "sm", color: "fg.muted" })}>
					Not called yet. It counts as 0 for them if it locks uncalled.
				</p>
			)}
		</VStack>
	)
}

function StepForm({
	entry,
	creatorUsername,
	showGame,
	initial,
	isFirst,
	isLast,
	onBack,
	onSave,
}: {
	entry: Entry
	creatorUsername: string
	showGame: boolean
	initial: CallDraft | undefined
	isFirst: boolean
	isLast: boolean
	onBack: () => void
	onSave: (draft: CallDraft) => void
}) {
	const statContext = useQuery(questionStatContextQuery(entry.question.id))
	const callForm = useCastCallForm(entry.question, {
		surface: "challenge",
		formId: "challenge-step-form",
		draft: { initial, onSave },
	})

	return (
		<VStack gap="4" alignItems="stretch">
			<Card variant="surface" size="md">
				<Card.Body>
					<VStack gap="4" alignItems="stretch">
						<QuestionSummaryHeader
							question={entry.question}
							showGame={showGame}
						/>
						<CreatorCall username={creatorUsername} call={entry.creatorCall} />
					</VStack>
				</Card.Body>
			</Card>
			{/* The same numbers the question page puts above its pick form, so
			    calling here is never calling with less to go on. */}
			<StatContextCard
				statContext={statContext.data?.question?.statContext}
				trackRecord={statContext.data?.question?.viewerTrackRecord}
				teams={teamLabelsOf(entry.question.game)}
				isCallable
			/>
			<CastCallForm callForm={callForm} />
			<callForm.form.Subscribe selector={(s) => s.meta}>
				{(meta) => (
					<VStack gap="2" alignItems="stretch">
						<HStack justify="space-between" gap="3">
							<Button
								variant="ghost"
								size="md"
								onClick={onBack}
								className={css({ visibility: isFirst ? "hidden" : "visible" })}
							>
								<FiChevronLeft />
								Back
							</Button>
							<Button
								type="submit"
								form={callForm.formId}
								variant="solid"
								size="md"
								disabled={!meta.canSubmit}
							>
								{isLast ? "Review my calls" : "Next"}
								<FiChevronRight />
							</Button>
						</HStack>
						<FormError message={meta.formError} />
					</VStack>
				)}
			</callForm.form.Subscribe>
		</VStack>
	)
}

// What each side's call on a question stands to count for in the 1v1.
function entryPoints(
	entry: Entry,
	draft: CallDraft | undefined,
	alreadyCalled: boolean,
): {
	yours: ChallengePointsRange | null
	creator: ChallengePointsRange | null
} {
	const form = unmask(CastCallFormFragment, entry.question)
	const yours = alreadyCalled
		? entry.question.viewerCall &&
			challengePointsRange(form, toPicks(entry.question.viewerCall), false)
		: draft
			? challengePointsRange(form, draft, true)
			: null
	const creator =
		entry.creatorCall &&
		challengePointsRange(form, toPicks(entry.creatorCall), false)
	return { yours, creator }
}

type Totals = { best: number; worst: number }

// Everything hitting, and everything missing. A question not called adds
// nothing either way, the same as it scores.
function totalsOf(ranges: (ChallengePointsRange | null)[]): Totals {
	return ranges.reduce<Totals>(
		(t, r) => (r ? { best: t.best + r.winHigh, worst: t.worst - r.lose } : t),
		{ best: 0, worst: 0 },
	)
}

function TotalsLine({ label, totals }: { label: string; totals: Totals }) {
	return (
		<HStack justify="space-between" gap="3" flexWrap="wrap">
			<span className={css({ fontWeight: "semibold" })}>{label}</span>
			<HStack gap="4" className={css({ fontFamily: "mono", fontSize: "sm" })}>
				<span>
					<span
						className={css({ color: "success.default", fontWeight: "bold" })}
					>
						+{totals.best}
					</span>{" "}
					<span className={css({ color: "fg.muted", fontSize: "xs" })}>
						all right
					</span>
				</span>
				<span>
					<span
						className={css({ color: "danger.default", fontWeight: "bold" })}
					>
						{totals.worst === 0 ? "0" : `−${-totals.worst}`}
					</span>{" "}
					<span className={css({ color: "fg.muted", fontSize: "xs" })}>
						all wrong
					</span>
				</span>
			</HStack>
		</HStack>
	)
}

function Review({
	challenge,
	showGame,
	drafts,
	onEdit,
}: {
	challenge: Challenge
	showGame: boolean
	drafts: Record<string, CallDraft>
	onEdit: (index: number) => void
}) {
	const missingIds = challenge.viewerMissingQuestionIds
	const points = challenge.entries.map((entry) =>
		entryPoints(
			entry,
			drafts[entry.question.id],
			!missingIds.includes(entry.question.id),
		),
	)
	return (
		<VStack gap="3" alignItems="stretch">
			<Card variant="subtle" size="md">
				<Card.Body>
					<VStack gap="3" alignItems="stretch">
						<span className={sideLabel}>Across all of them</span>
						<TotalsLine
							label="You"
							totals={totalsOf(points.map((p) => p.yours))}
						/>
						<TotalsLine
							label={`@${challenge.creator.username}`}
							totals={totalsOf(points.map((p) => p.creator))}
						/>
						<p className={css({ fontSize: "xs", color: "fg.subtle" })}>
							The 1v1 goes to whoever ends up with more, so a mix of hits and
							misses lands somewhere in between.
						</p>
					</VStack>
				</Card.Body>
			</Card>
			{challenge.entries.map((entry) => {
				const index = missingIds.indexOf(entry.question.id)
				return (
					<ReviewRow
						key={entry.question.id}
						entry={entry}
						creatorUsername={challenge.creator.username}
						showGame={showGame}
						draft={drafts[entry.question.id]}
						alreadyCalled={index === -1}
						onEdit={() => onEdit(index)}
					/>
				)
			})}
		</VStack>
	)
}

function ReviewRow({
	entry,
	creatorUsername,
	showGame,
	draft,
	alreadyCalled,
	onEdit,
}: {
	entry: Entry
	creatorUsername: string
	showGame: boolean
	draft: CallDraft | undefined
	alreadyCalled: boolean
	onEdit: () => void
}) {
	const form = unmask(CastCallFormFragment, entry.question)
	const yours = alreadyCalled
		? entry.question.viewerCall
		: draft
			? draftSummary(form, draft)
			: null
	const { yours: yourPoints, creator: creatorPoints } = entryPoints(
		entry,
		draft,
		alreadyCalled,
	)

	return (
		<Card variant="surface" size="md">
			<Card.Body>
				<VStack gap="4" alignItems="stretch">
					<QuestionSummaryHeader
						question={entry.question}
						showGame={showGame}
					/>
					<CardRule />
					<VStack gap="4" alignItems="stretch">
						<VStack gap="2" alignItems="stretch">
							<HStack justify="space-between" alignItems="center" gap="3">
								<span className={sideLabel}>
									{alreadyCalled ? "Your call (already in)" : "Your call"}
								</span>
								{!alreadyCalled && (
									<Button variant="dark" size="sm" onClick={onEdit}>
										{draft ? "Change" : "Call it"}
									</Button>
								)}
							</HStack>
							{yours ? (
								<VStack gap="2" alignItems="stretch">
									<PickList call={yours} />
									{yourPoints && <PossiblePoints range={yourPoints} />}
								</VStack>
							) : (
								<p className={css({ fontSize: "sm", color: "fg.muted" })}>
									Not called yet
								</p>
							)}
						</VStack>
						<VStack
							gap="2"
							alignItems="stretch"
							className={css({
								paddingTop: "4",
								borderTop: "1px solid {colors.border.default}",
							})}
						>
							<span className={sideLabel}>@{creatorUsername}'s call</span>
							{entry.creatorCall ? (
								<VStack gap="2" alignItems="stretch">
									<PickList call={entry.creatorCall} />
									{creatorPoints && <PossiblePoints range={creatorPoints} />}
								</VStack>
							) : (
								<p className={css({ fontSize: "sm", color: "fg.muted" })}>
									Not called yet
								</p>
							)}
						</VStack>
					</VStack>
				</VStack>
			</Card.Body>
		</Card>
	)
}
