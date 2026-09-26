import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import type { GloatMessage } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { GloatDocument } from "#/graphql/mutations/calls"
import { CallRecordDocument } from "#/graphql/queries/call"
import { gqlQueryKey } from "#/graphql/query-options"
import { gloatChoices } from "#/lib/fade-copy"
import { closeModal } from "#/stores/modal-store"

// Who a gloat goes to. DOUBTERS: every doubter on the viewer's call who was
// wrong, in one send. TARGET: the owner of the call the viewer faded.
export type GloatAudience =
	| { kind: "doubters"; callId: string; count: number }
	| { kind: "target"; fadeId: string; username: string }

const choiceClass = css({
	textAlign: "left",
	fontSize: "md",
	fontWeight: "semibold",
	color: "fg.default",
	background: "bg.canvas",
	border: "1px solid {colors.border.default}",
	borderRadius: "md",
	paddingBlock: "3",
	paddingInline: "4",
	cursor: "pointer",
	_hover: { borderColor: "border.emphasized" },
})

const selectedClass = css({
	textAlign: "left",
	fontSize: "md",
	fontWeight: "semibold",
	color: "fg.default",
	background: "bg.subtle",
	border: "1px solid {colors.primary.default}",
	borderRadius: "md",
	paddingBlock: "3",
	paddingInline: "4",
	cursor: "pointer",
})

// Pick one line from a set list and send it. One gloat per result, so the
// modal says so before anything goes out.
export function GloatModal({ audience }: { audience: GloatAudience }) {
	const choices = gloatChoices(
		audience.kind === "doubters" ? "target" : "fader",
	)
	const [selected, setSelected] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const send = useGqlMutation(GloatDocument)
	const queryClient = useQueryClient()

	const title =
		audience.kind === "doubters"
			? "Gloat at your doubters"
			: `Gloat at @${audience.username}`
	const description =
		audience.kind === "doubters"
			? audience.count === 1
				? "Goes to the doubter who was wrong. You get one gloat per result."
				: `Goes to all ${audience.count} doubters who were wrong. You get one gloat per result.`
			: `Goes to @${audience.username}. You get one gloat per result.`

	async function onSend() {
		if (!selected) return
		setError(null)
		const input =
			audience.kind === "doubters"
				? { callId: audience.callId, message: selected as GloatMessage }
				: { fadeId: audience.fadeId, message: selected as GloatMessage }
		const result = (await send.mutateAsync({ input }))?.gloat
		if (!result) {
			setError("Something went wrong. Try again.")
			return
		}
		await match(result)
			.with({ __typename: "GloatPayload" }, async () => {
				closeModal()
				// Both call pages show a gloat: the target's Doubters list and
				// the fader's own call.
				await queryClient.invalidateQueries({
					queryKey: [gqlQueryKey(CallRecordDocument, { id: "" })[0]],
				})
			})
			.with({ __typename: "ValidationError" }, async (r) => {
				setError(r.fieldErrors?.[0]?.message ?? "Couldn't send that.")
			})
			.with(
				{ __typename: "AuthenticationError" },
				{ __typename: "NotFoundError" },
				async (r) => {
					setError(r.message)
				},
			)
			.exhaustive()
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>{title}</Modal.Title>
			<Modal.Description>{description}</Modal.Description>
			<VStack gap="2" alignItems="stretch">
				{choices.map((choice) => (
					<button
						key={choice.value}
						type="button"
						aria-pressed={selected === choice.value}
						className={selected === choice.value ? selectedClass : choiceClass}
						onClick={() => setSelected(choice.value)}
					>
						{choice.text}
					</button>
				))}
			</VStack>
			<VStack gap="2" alignItems="stretch">
				<Button
					variant="solid"
					size="lg"
					fullWidth
					loading={send.isPending}
					disabled={!selected}
					onClick={onSend}
				>
					Send
				</Button>
				<FormError message={error} />
			</VStack>
		</Modal>
	)
}
