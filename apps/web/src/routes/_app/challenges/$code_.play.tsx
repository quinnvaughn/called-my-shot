import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { z } from "zod"
import { ChallengeReview } from "#/components/challenges/challenge-play/challenge-review"
import { ChallengeStepForm } from "#/components/challenges/challenge-play/challenge-step-form"
import type { Challenge } from "#/components/challenges/challenge-play/types"
import { useAcceptChallenge } from "#/components/challenges/use-accept-challenge"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { Button, button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { NotFound } from "#/components/ui/not-found"
import { challengePageQuery } from "#/graphql/challenges/queries"
import { useRequireAuth } from "#/hooks/use-require-auth"
import { singleGameOf } from "#/lib/challenge"
import { pluralize } from "#/lib/pluralize"
import { searchFlag } from "#/lib/search-params"

// Taking a challenge on: one question per screen, then a review of every
// call, then one send. Calls are held in storage until then, so a visitor
// can make them all before signing up.
export const Route = createFileRoute("/_app/challenges/$code_/play")({
	component: RouteComponent,
	validateSearch: z.object({
		step: z.number().positive().optional().catch(undefined),
		review: searchFlag,
	}),
	loader: ({ context, params }) =>
		context.queryClient.query(challengePageQuery(params.code)),
})

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
				link={{ text: "Back to home", url: "/" }}
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
				<ChallengeReview
					challenge={challenge}
					showGame={!game}
					drafts={accept.drafts}
					onEdit={(index) => goTo(index)}
				/>
			) : current && accept.loaded ? (
				<ChallengeStepForm
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
