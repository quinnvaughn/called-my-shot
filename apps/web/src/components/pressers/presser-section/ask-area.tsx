import { PRESSER_QUESTION_MAX } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { AuthModal } from "#/components/auth/auth-modal"
import {
	presserBodyText,
	presserEyebrow,
} from "#/components/pressers/presser-qa-item"
import { presserResultError } from "#/components/pressers/presser-result"
import { PresserTextForm } from "#/components/pressers/presser-text-form"
import { Button } from "#/components/ui/button"
import { useGqlMutation } from "#/graphql/hooks"
import {
	AskPresserQuestionDocument,
	invalidatePressers,
} from "#/graphql/pressers/mutations"
import type { IdentityData } from "#/lib/identity"
import { openModal } from "#/stores/modal-store"
import type { PresserData } from "./types"

// The bottom of someone else's presser: the form to ask, the viewer's own
// question while it waits, or why they can't ask.
export function AskArea({
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
					if (!error) await invalidatePressers(queryClient)
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
