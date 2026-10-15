import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { ApiError } from "#/graphql/api-error"
import { AttachFadeDocument } from "#/graphql/calls/mutations"
import { CallRecordDocument } from "#/graphql/calls/queries"
import { useGqlMutation } from "#/graphql/hooks"
import { gqlQueryKey } from "#/graphql/query-options"
import { closeModal } from "#/stores/modal-store"
import { Sides } from "./sides"
import type { FadeCallModalProps } from "./types"

export function AttachFade(props: FadeCallModalProps) {
	const attach = useGqlMutation(AttachFadeDocument)
	const queryClient = useQueryClient()
	const [error, setError] = useState<string | null>(null)

	async function onConfirm() {
		setError(null)
		const result = (
			await attach.mutateAsync({ input: { targetCallId: props.callId } })
		)?.attachFade
		if (!result) {
			setError("Something went wrong. Try again.")
			return
		}
		await match(result)
			.with({ __typename: "AttachFadePayload" }, async () => {
				closeModal()
				await queryClient.invalidateQueries({
					queryKey: gqlQueryKey(CallRecordDocument, { id: props.callId }),
				})
			})
			.with({ __typename: "ValidationError" }, async (r) => {
				setError(r.fieldErrors?.[0]?.message ?? "Couldn't fade this call.")
			})
			.with(ApiError, async (r) => {
				setError(r.message)
			})
			.exhaustive()
	}

	return (
		<>
			<Modal.Description>
				Your call is already on the other side. Aim it at @{props.opUsername}
				and it's listed under their Doubters. Your pick and conviction stay as
				they are.
			</Modal.Description>
			<VStack gap="4" alignItems="stretch">
				<Sides {...props} />
				<VStack gap="2" alignItems="stretch">
					<Button
						variant="solid"
						size="lg"
						fullWidth
						loading={attach.isPending}
						onClick={onConfirm}
					>
						Fade @{props.opUsername}
					</Button>
					<FormError message={error} />
				</VStack>
			</VStack>
		</>
	)
}
