import {
	PRESSER_ANSWER_MAX,
	PRESSER_QUESTION_MAX,
	PRESSER_STATEMENT_MAX,
} from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { FiMic } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { AuthModal } from "#/components/auth/auth-modal"
import { Button } from "#/components/ui/button"
import { Identity } from "#/components/ui/identity"
import { PresserSectionFragment } from "#/graphql/fragments/presser"
import { type FragmentType, useFragment } from "#/graphql/generated"
import { useGqlMutation } from "#/graphql/hooks"
import {
	AnswerPresserQuestionDocument,
	AskPresserQuestionDocument,
	BlockUserDocument,
	PostPresserStatementDocument,
} from "#/graphql/mutations/pressers"
import { track } from "#/lib/analytics"
import { type IdentityData, toIdentity } from "#/lib/identity"
import { openModal } from "#/stores/modal-store"
import {
	PresserMenu,
	type PresserMenuAction,
	PresserQaItem,
	presserBodyText,
	presserEyebrow,
} from "./presser-qa-item"
import { closesInLabel, presserResultError } from "./presser-result"
import { PresserTextForm } from "./presser-text-form"
import { ReportPresserModal } from "./report-presser-modal"

type Props = {
	presser: FragmentType<typeof PresserSectionFragment>
	viewerId: string | null
	// The visit came from a group's page or board.
	viaGroup: boolean
}

type PresserData = ReturnType<typeof usePresser>
type QuestionData = PresserData["questions"][number]

function usePresser(presser: Props["presser"]) {
	return useFragment(PresserSectionFragment, presser)
}

// The post-game presser on someone's picks page: their opening statement,
// the questions they answered, and, for the owner, the ones still waiting on
// them. Questions only go public once answered, so nobody but the owner and
// the asker ever sees one that wasn't.
export function PresserSection({
	presser: presserProp,
	viewerId,
	viaGroup,
}: Props) {
	const p = usePresser(presserProp)
	const owner = toIdentity(p.owner)
	const answered = p.questions.filter((q) => q.isAnswered)
	const pending = p.questions.filter((q) => !q.isAnswered)

	// Nothing said yet and nothing the viewer can do: no section at all.
	const hidden =
		!p.viewerIsOwner &&
		!p.statement &&
		answered.length === 0 &&
		!p.viewerQuestion &&
		p.viewerAskStatus !== "CAN_ASK"

	// Once per presser per visit, and only when there was something to see.
	// biome-ignore lint/correctness/useExhaustiveDependencies: one event per presser shown, not per refetch
	useEffect(() => {
		if (hidden) return
		track("presser_viewed", {
			presserId: p.id,
			isOwner: p.viewerIsOwner,
			askStatus: p.viewerAskStatus,
			viaGroup,
		})
	}, [p.id, hidden])

	if (hidden) return null
	return (
		<VStack
			id="presser"
			gap="4"
			alignItems="stretch"
			className={css({
				padding: "5",
				borderRadius: "xl",
				bg: "bg.surface",
				border: "1px solid {colors.border.default}",
			})}
		>
			<HStack justify="space-between" alignItems="baseline" gap="3">
				<VStack gap="0.5" alignItems="flex-start">
					<HStack gap="1.5" className={presserEyebrow}>
						<FiMic size={12} aria-hidden />
						Post-game presser
					</HStack>
					<h2 className={css({ fontSize: "lg", fontFamily: "heading" })}>
						{p.viewerIsOwner
							? "Your presser"
							: `@${owner.username} takes questions`}
					</h2>
				</VStack>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: p.isOpen ? "secondary.default" : "fg.subtle",
						whiteSpace: "nowrap",
					})}
				>
					{p.isOpen ? closesInLabel(p.closesAt) : "Closed"}
				</span>
			</HStack>

			<Statement presser={p} owner={owner} viewerId={viewerId} />

			{p.viewerIsOwner && pending.length > 0 && (
				<VStack gap="1" alignItems="stretch">
					<span className={presserEyebrow}>
						Waiting on you · only you and whoever asked can see these
					</span>
					{pending.map((q) => (
						<PendingQuestion key={q.id} presser={p} question={q} />
					))}
				</VStack>
			)}

			{answered.length > 0 && (
				<VStack gap="1" alignItems="stretch">
					{answered.map((q) => (
						<PresserQaItem
							key={q.id}
							asker={q.asker ? toIdentity(q.asker) : null}
							callTitle={q.call?.question.title ?? null}
							body={q.body}
							answer={
								q.noComment
									? { kind: "no_comment" }
									: { kind: "text", text: q.answer ?? "" }
							}
							actions={questionActions(p, q, viewerId)}
						/>
					))}
				</VStack>
			)}

			{p.viewerIsOwner &&
				p.isOpen &&
				answered.length === 0 &&
				pending.length === 0 && (
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						No questions yet. Groupmates and anyone who called this game can ask
						until it closes.
					</p>
				)}

			{!p.viewerIsOwner && <AskArea presser={p} owner={owner} />}
		</VStack>
	)
}

function reportAction(
	label: string,
	presserId: string,
	presserQuestionId: string | null,
	target: "QUESTION" | "ANSWER" | "STATEMENT",
): PresserMenuAction {
	return {
		label,
		danger: true,
		onSelect: () =>
			openModal(
				<ReportPresserModal
					presserId={presserId}
					presserQuestionId={presserQuestionId}
					target={target}
				/>,
			),
	}
}

// What a signed-in viewer can do about a question: report it (or its answer)
// unless it's their own words, and, as the owner, block whoever asked it.
function questionActions(
	p: PresserData,
	q: QuestionData,
	viewerId: string | null,
	onBlock?: () => void,
): PresserMenuAction[] {
	if (!viewerId) return []
	const actions: PresserMenuAction[] = []
	const askedByViewer = q.asker?.id === viewerId
	if (q.asker && !askedByViewer) {
		actions.push(reportAction("Report question", p.id, q.id, "QUESTION"))
	}
	if (q.isAnswered && !q.noComment && !p.viewerIsOwner) {
		actions.push(reportAction("Report answer", p.id, q.id, "ANSWER"))
	}
	if (onBlock)
		actions.push({ label: "Block asker", danger: true, onSelect: onBlock })
	return actions
}

function Statement({
	presser: p,
	owner,
	viewerId,
}: {
	presser: PresserData
	owner: IdentityData
	viewerId: string | null
}) {
	const post = useGqlMutation(PostPresserStatementDocument)
	const queryClient = useQueryClient()

	if (p.statement) {
		const actions =
			viewerId && !p.viewerIsOwner
				? [reportAction("Report statement", p.id, null, "STATEMENT")]
				: []
		return (
			<VStack gap="2" alignItems="stretch">
				<HStack justify="space-between" alignItems="flex-start" gap="3">
					<VStack gap="1.5" alignItems="flex-start">
						<span className={presserEyebrow}>Opening statement</span>
						<Identity
							name={owner.name}
							username={owner.username}
							avatarUrl={owner.avatarUrl}
							flair={owner.flair}
							size="xs"
						/>
					</VStack>
					<PresserMenu label="Statement options" actions={actions} />
				</HStack>
				<p className={presserBodyText}>{p.statement}</p>
			</VStack>
		)
	}
	if (!p.viewerIsOwner || !p.isOpen || p.statementPostedAt) return null

	return (
		<PresserTextForm
			label="Opening statement (optional)"
			placeholder="Say your piece about the night. You only get one."
			max={PRESSER_STATEMENT_MAX}
			submitLabel="Post statement"
			onSubmit={async (text) => {
				const data = await post.mutateAsync({
					input: { presserId: p.id, text },
				})
				const error = presserResultError(data?.postPresserStatement)
				if (!error) await queryClient.invalidateQueries()
				return error
			}}
		/>
	)
}

function PendingQuestion({
	presser: p,
	question: q,
}: {
	presser: PresserData
	question: QuestionData
}) {
	const answer = useGqlMutation(AnswerPresserQuestionDocument)
	const block = useGqlMutation(BlockUserDocument)
	const queryClient = useQueryClient()
	const asker = q.asker ? toIdentity(q.asker) : null

	async function submit(input: { answer?: string; noComment?: boolean }) {
		const data = await answer.mutateAsync({
			input: { questionId: q.id, ...input },
		})
		const error = presserResultError(data?.answerPresserQuestion)
		if (!error) await queryClient.invalidateQueries()
		return error
	}

	const onBlock = asker
		? async () => {
				await block.mutateAsync({ username: asker.username })
				await queryClient.invalidateQueries()
			}
		: undefined

	return (
		<PresserQaItem
			asker={asker}
			callTitle={q.call?.question.title ?? null}
			body={q.body}
			answer={null}
			actions={questionActions(p, q, toIdentity(p.owner).id, onBlock)}
		>
			{p.isOpen && (
				<PresserTextForm
					label="Your answer"
					placeholder="Once it's answered, everyone can see the question and your answer."
					max={PRESSER_ANSWER_MAX}
					submitLabel="Answer"
					onSubmit={(text) => submit({ answer: text })}
					alternate={{
						label: "No comment",
						onSelect: () => submit({ noComment: true }),
					}}
				/>
			)}
		</PresserQaItem>
	)
}

// The bottom of someone else's presser: the form to ask, the viewer's own
// question while it waits, or why they can't ask.
function AskArea({
	presser: p,
	owner,
}: {
	presser: PresserData
	owner: IdentityData
}) {
	const ask = useGqlMutation(AskPresserQuestionDocument)
	const queryClient = useQueryClient()

	if (p.viewerQuestion && !p.viewerQuestion.isAnswered) {
		return (
			<VStack
				gap="1.5"
				alignItems="stretch"
				className={css({
					paddingTop: "4",
					borderTop: "1px solid {colors.border.default}",
				})}
			>
				<span className={presserEyebrow}>
					Your question · waiting on @{owner.username}
				</span>
				<p className={presserBodyText}>{p.viewerQuestion.body}</p>
				<p className={css({ fontSize: "xs", color: "fg.muted" })}>
					Only you and @{owner.username} can see it until they answer.
				</p>
			</VStack>
		)
	}

	const note = (text: string) => (
		<p className={css({ fontSize: "sm", color: "fg.muted" })}>{text}</p>
	)

	return match(p.viewerAskStatus)
		.with("CAN_ASK", () => (
			<PresserTextForm
				label={`Ask @${owner.username} a question`}
				placeholder="One question. It stays between you two until they answer it."
				max={PRESSER_QUESTION_MAX}
				submitLabel="Ask"
				onSubmit={async (body) => {
					const data = await ask.mutateAsync({
						input: { presserId: p.id, body },
					})
					const error = presserResultError(data?.askPresserQuestion)
					if (!error) await queryClient.invalidateQueries()
					return error
				}}
			/>
		))
		.with("SIGNED_OUT", () =>
			p.isOpen ? (
				<HStack justify="space-between" gap="3" flexWrap="wrap">
					{note(`Sign in to ask @${owner.username} a question.`)}
					<Button
						variant="solid"
						size="sm"
						onClick={() => openModal(<AuthModal defaultView="signin" />)}
					>
						Sign in
					</Button>
				</HStack>
			) : null,
		)
		.with("NOT_ELIGIBLE", () =>
			note(
				`Only people in a group with @${owner.username}, or who made a call on this game, can ask.`,
			),
		)
		.with("NEW_ACCOUNT", () =>
			note(
				"Asking someone outside your groups takes an account at least a week old with 10 settled calls.",
			),
		)
		.with("STRANGER_CAP_REACHED", () =>
			note(
				`@${owner.username} already has all the questions they can take from outside their groups.`,
			),
		)
		.with("ALREADY_ASKED", "BLOCKED", "CLOSED", "OWN_PRESSER", () => null)
		.exhaustive()
}
