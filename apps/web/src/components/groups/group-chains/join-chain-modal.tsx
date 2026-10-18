import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import {
	chainErrorMessage,
	invalidateChain,
	RequestChainLinkDocument,
} from "#/graphql/chains/mutations"
import { ChainCandidatesDocument } from "#/graphql/chains/queries"
import { useGqlMutation } from "#/graphql/hooks"
import { gqlQueryOptions } from "#/graphql/query-options"
import { CHAIN_BONUS_PCT, multiplierLabel } from "#/lib/chains"
import { closeModal } from "#/stores/modal-store"
import { requestPushPrompt } from "#/stores/push-prompt-store"
import { CallPicker } from "./call-picker"

// Asks the chain's starter to add one of the viewer's open calls.
export function JoinChainModal({
	chainId,
	starterUsername,
}: {
	chainId: string
	starterUsername: string | null
}) {
	const { data } = useQuery(
		gqlQueryOptions(ChainCandidatesDocument, { chainId }),
	)
	const request = useGqlMutation(RequestChainLinkDocument)
	const queryClient = useQueryClient()
	const [callId, setCallId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const chain = data?.chain

	async function submit() {
		if (!callId) return
		setError(null)
		const result = (await request.mutateAsync({ input: { chainId, callId } }))
			?.requestChainLink
		if (result?.__typename === "ChainPayload") {
			await invalidateChain(queryClient)
			closeModal()
			requestPushPrompt("chain_joined")
			return
		}
		setError(chainErrorMessage(result))
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Add your link</Modal.Title>
			<Modal.Description>
				{starterUsername ? `@${starterUsername}` : "The starter"} decides
				whether it goes in. Your link has to be on a game nobody else in the
				chain has.
			</Modal.Description>
			<VStack gap="4" alignItems="stretch">
				{chain && (
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						With the links already in, your win would be multiplied by{" "}
						<span
							className={css({
								color: "secondary.default",
								fontWeight: "semibold",
							})}
						>
							{multiplierLabel(chain.multiplierForNewLink)}
						</span>{" "}
						if every link hits: the odds plus {CHAIN_BONUS_PCT}% for chaining.
					</p>
				)}
				<CallPicker
					candidates={chain?.viewerLinkCandidates ?? []}
					selectedCallId={callId}
					onSelect={setCallId}
				/>
				<FormError message={error} />
				<Button
					variant="solid"
					size="lg"
					fullWidth
					disabled={!callId}
					loading={request.isPending}
					onClick={submit}
				>
					Ask to join
				</Button>
			</VStack>
		</Modal>
	)
}
