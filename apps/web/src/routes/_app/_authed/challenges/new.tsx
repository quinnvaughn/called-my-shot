import { CHALLENGE_QUESTIONS_MAX } from "@called-my-shot/schemas"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { ChallengeCandidateBrowser } from "#/components/challenges/challenge-candidate-browser"
import { ChallengePickedQuestions } from "#/components/challenges/challenge-picked-questions"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { Eyebrow } from "#/components/ui/eyebrow"
import { FormError } from "#/components/ui/form-error"
import { PageHeader } from "#/components/ui/page-header"
import { ToggleRow } from "#/components/ui/toggle-row"
import { CreateChallengeDocument } from "#/graphql/challenges/mutations"
import { challengeCandidatesQuery } from "#/graphql/challenges/queries"
import { useGqlMutation } from "#/graphql/hooks"
import { track } from "#/lib/analytics"
import { requestPushPrompt } from "#/stores/push-prompt-store"

export const Route = createFileRoute("/_app/_authed/challenges/new")({
	component: RouteComponent,
	// question: start with that one picked. game: start with every open
	// question on that game the viewer has called (their picks on it).
	validateSearch: z.object({
		question: z.string().optional().catch(undefined),
		game: z.string().optional().catch(undefined),
		source: z
			.enum([
				"question",
				"call",
				"game",
				"game_picks",
				"new_question",
				"builder",
			])
			.optional()
			.catch(undefined),
	}),
	loaderDeps: ({ search }) => ({
		game: search.game ?? null,
		question: search.question ?? null,
	}),
	loader: ({ context, deps }) =>
		context.queryClient.query(
			challengeCandidatesQuery(deps.game, deps.question),
		),
})

function RouteComponent() {
	const search = Route.useSearch()
	const { data } = useSuspenseQuery(
		challengeCandidatesQuery(search.game ?? null, search.question ?? null),
	)
	const navigate = useNavigate()
	const createChallenge = useGqlMutation(CreateChallengeDocument)
	const candidates = data.challengeCandidates
	const groups = data.myGroups

	const [picked, setPicked] = useState<string[]>(() =>
		candidates
			.filter(
				(q) =>
					q.id === search.question ||
					(search.game != null &&
						q.game?.id === search.game &&
						q.viewerCall != null),
			)
			.map((q) => q.id),
	)
	const [groupIds, setGroupIds] = useState<string[]>([])
	const [error, setError] = useState<string | null>(null)

	const pickedQuestions = picked.flatMap(
		(id) => candidates.find((q) => q.id === id) ?? [],
	)

	const toggle = (list: string[], id: string, on: boolean) =>
		on ? [...list, id] : list.filter((x) => x !== id)
	const togglePicked = (id: string, on: boolean) =>
		setPicked((p) => toggle(p, id, on))
	const tooMany = picked.length > CHALLENGE_QUESTIONS_MAX

	async function create() {
		setError(null)
		const result = (
			await createChallenge.mutateAsync({
				input: { questionIds: picked, groupIds },
			})
		)?.createChallenge
		if (result?.__typename !== "ChallengePayload") {
			setError(
				result?.__typename === "ValidationError"
					? (result.fieldErrors?.[0]?.message ?? result.message)
					: (result?.message ?? "Something went wrong. Try again."),
			)
			return
		}
		track("challenge_created", {
			challengeId: result.challenge.id,
			questionCount: picked.length,
			groupCount: groupIds.length,
			source: search.source ?? "builder",
		})
		requestPushPrompt("challenge_created")
		await navigate({
			to: "/challenges/$code",
			params: { code: result.challenge.code },
		})
	}

	return (
		<VStack gap="6" alignItems="stretch" className={css({ paddingTop: "6" })}>
			<PageHeader
				title="New challenge"
				description="Pick the questions. Anyone you send the link to can take you on, each as their own 1v1, until the first question locks. Whoever scores more points across them wins."
			/>
			<ChallengePickedQuestions
				pickedCount={picked.length}
				questions={pickedQuestions}
				onToggle={togglePicked}
			/>
			{candidates.length === 0 ? (
				<EmptyState>
					Make a call on an open question first, then challenge people on it.
				</EmptyState>
			) : (
				<ChallengeCandidateBrowser
					candidates={candidates}
					picked={picked}
					openGameId={search.game}
					openQuestionId={search.question}
					onToggle={togglePicked}
				/>
			)}
			{groups.length > 0 && (
				<Card size="md">
					<Card.Header>
						<Eyebrow variant="neutral">Post it to your groups</Eyebrow>
					</Card.Header>
					<Card.Body>
						<VStack gap="4" alignItems="stretch">
							{groups.map((g) => (
								<ToggleRow
									key={g.id}
									label={g.name}
									checked={groupIds.includes(g.id)}
									onChange={(on) => setGroupIds((ids) => toggle(ids, g.id, on))}
								/>
							))}
						</VStack>
					</Card.Body>
				</Card>
			)}
			<VStack gap="2" alignItems="stretch">
				{picked.some(
					(id) => !candidates.find((q) => q.id === id)?.viewerCall,
				) && (
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						You can share it before calling everything. Call each question
						before it locks: one you don't call counts as 0 for you.
					</p>
				)}
				<Button
					variant="solid"
					size="lg"
					fullWidth
					disabled={picked.length === 0 || tooMany}
					loading={createChallenge.isPending}
					onClick={create}
				>
					{tooMany
						? `Pick ${CHALLENGE_QUESTIONS_MAX} or fewer`
						: "Create challenge"}
				</Button>
				<FormError message={error} />
			</VStack>
		</VStack>
	)
}
