import { CHALLENGE_QUESTIONS_MAX } from "@called-my-shot/schemas"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Accordion } from "#/components/ui/accordion"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { Eyebrow } from "#/components/ui/eyebrow"
import { FormError } from "#/components/ui/form-error"
import { PageHeader } from "#/components/ui/page-header"
import { TextInput } from "#/components/ui/text-input"
import { ToggleRow } from "#/components/ui/toggle-row"
import type { ChallengeCandidatesQuery } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { CreateChallengeDocument } from "#/graphql/mutations/challenges"
import { challengeCandidatesQuery } from "#/graphql/queries/challenges"
import { track } from "#/lib/analytics"
import { pickSummary } from "#/lib/call-summary"
import { groupCandidates } from "#/lib/challenge"
import { formatShortDate } from "#/lib/format-date"
import { pluralize } from "#/lib/pluralize"

type Source =
	| "question"
	| "call"
	| "game"
	| "game_picks"
	| "new_question"
	| "builder"
const SOURCES: Source[] = [
	"question",
	"call",
	"game",
	"game_picks",
	"new_question",
	"builder",
]

type Search = { question?: string; game?: string; source?: Source }

export const Route = createFileRoute("/_app/_authed/challenges/new")({
	component: RouteComponent,
	// question: start with that one picked. game: start with every open
	// question on that game the viewer has called (their picks on it).
	validateSearch: (search: Record<string, unknown>): Search => ({
		...(typeof search.question === "string"
			? { question: search.question }
			: {}),
		...(typeof search.game === "string" ? { game: search.game } : {}),
		...(SOURCES.includes(search.source as Source)
			? { source: search.source as Source }
			: {}),
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

	const [query, setQuery] = useState("")
	const needle = query.trim().toLowerCase()
	const searching = needle.length > 0
	const pickedQuestions = picked.flatMap(
		(id) => candidates.find((q) => q.id === id) ?? [],
	)
	const visibleGroups = groupCandidates(
		searching
			? candidates.filter((q) => q.title.toLowerCase().includes(needle))
			: candidates,
	)

	const toggle = (list: string[], id: string, on: boolean) =>
		on ? [...list, id] : list.filter((x) => x !== id)
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
			<Card size="md">
				<Card.Header>
					<Eyebrow variant="neutral">
						{`${picked.length} ${pluralize(picked.length, "question")} picked`}
					</Eyebrow>
				</Card.Header>
				<Card.Body>
					{pickedQuestions.length === 0 ? (
						<EmptyState>Pick questions from your games below.</EmptyState>
					) : (
						<VStack gap="4" alignItems="stretch">
							{pickedQuestions.map((q) => (
								<CandidateRow
									key={q.id}
									question={q}
									checked
									onChange={(on) => setPicked((p) => toggle(p, q.id, on))}
								/>
							))}
						</VStack>
					)}
				</Card.Body>
			</Card>
			{candidates.length === 0 ? (
				<EmptyState>
					Make a call on an open question first, then challenge people on it.
				</EmptyState>
			) : (
				<VStack gap="3" alignItems="stretch">
					<TextInput>
						<TextInput.Group>
							<TextInput.Field
								type="search"
								placeholder="Search your open questions"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
						</TextInput.Group>
					</TextInput>
					{visibleGroups.length === 0 && (
						<EmptyState>No open questions match that.</EmptyState>
					)}
					{visibleGroups.map((group) => {
						const pickedHere = group.questions.filter((q) =>
							picked.includes(q.id),
						).length
						return (
							<Accordion
								// Remounts on a search so every match opens.
								key={`${group.key}:${searching}`}
								title={group.title}
								subtitle={[
									group.startsAt ? formatShortDate(group.startsAt) : null,
									`${group.questions.length} open`,
									pickedHere > 0 ? `${pickedHere} picked` : null,
								]
									.filter(Boolean)
									.join(" · ")}
								defaultOpen={
									searching ||
									group.gameId === search.game ||
									group.questions.some((q) => q.id === search.question)
								}
							>
								<VStack gap="4" alignItems="stretch">
									{group.questions.map((q) => (
										<CandidateRow
											key={q.id}
											question={q}
											checked={picked.includes(q.id)}
											onChange={(on) => setPicked((p) => toggle(p, q.id, on))}
										/>
									))}
								</VStack>
							</Accordion>
						)
					})}
				</VStack>
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

type Candidate = ChallengeCandidatesQuery["challengeCandidates"][number]

function CandidateRow({
	question,
	checked,
	onChange,
}: {
	question: Candidate
	checked: boolean
	onChange: (on: boolean) => void
}) {
	return (
		<ToggleRow
			label={question.title}
			description={
				question.viewerCall
					? `Your call: ${pickSummary(question.viewerCall)} · locks ${formatShortDate(question.locksAt)}`
					: `Not called yet · locks ${formatShortDate(question.locksAt)}`
			}
			checked={checked}
			onChange={onChange}
		/>
	)
}
