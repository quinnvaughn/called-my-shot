import { useEffect } from "react"
import { FiMic } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import {
	PresserQaItem,
	presserEyebrow,
} from "#/components/pressers/presser-qa-item"
import { closesInLabel } from "#/components/pressers/presser-result"
import { PresserSectionFragment } from "#/graphql/fragments/presser"
import { type FragmentType, useFragment } from "#/graphql/generated"
import { track } from "#/lib/analytics"
import { toIdentity } from "#/lib/identity"
import { AskArea } from "./ask-area"
import { PendingQuestion } from "./pending-question"
import { questionActions } from "./presser-actions"
import { Statement } from "./statement"

type Props = {
	presser: FragmentType<typeof PresserSectionFragment>
	viewerId: string | null
	// The visit came from a group's page or board.
	viaGroup: boolean
}

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
						textStyle: "label",
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
