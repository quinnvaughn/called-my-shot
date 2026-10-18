import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import {
	chainErrorMessage,
	invalidateChain,
	StartChainDocument,
} from "#/graphql/chains/mutations"
import { GroupChainCandidatesDocument } from "#/graphql/chains/queries"
import { useGqlMutation } from "#/graphql/hooks"
import { gqlQueryOptions } from "#/graphql/query-options"
import { CHAIN_BONUS_PCT } from "#/lib/chains"
import { closeModal } from "#/stores/modal-store"
import { requestPushPrompt } from "#/stores/push-prompt-store"
import { CallPicker } from "./call-picker"

// Starts a chain with one of the viewer's open calls as its first link.
export function StartChainModal({ groupId }: { groupId: string }) {
	const { data } = useQuery(
		gqlQueryOptions(GroupChainCandidatesDocument, { groupId }),
	)
	const start = useGqlMutation(StartChainDocument)
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const [callId, setCallId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	async function submit() {
		if (!callId) return
		setError(null)
		const result = (await start.mutateAsync({ input: { groupId, callId } }))
			?.startChain
		if (result?.__typename === "ChainPayload" && result.chain) {
			await invalidateChain(queryClient)
			closeModal()
			requestPushPrompt("chain_started")
			navigate({
				to: "/groups/$groupId/chains/$chainId",
				params: { groupId, chainId: result.chain.id },
			})
			return
		}
		setError(chainErrorMessage(result))
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Start a chain</Modal.Title>
			<Modal.Description>
				Pick the call you're putting in. Others in the group ask to add theirs,
				and you decide who's in. If every link hits, everyone's win is
				multiplied by the odds plus {CHAIN_BONUS_PCT}%. If any link misses,
				every hit in the chain scores 0 and every miss loses its points as
				usual.
			</Modal.Description>
			<VStack gap="4" alignItems="stretch">
				<CallPicker
					candidates={data?.group?.viewerChainCandidates ?? []}
					selectedCallId={callId}
					onSelect={setCallId}
				/>
				<FormError message={error} />
				<Button
					variant="solid"
					size="lg"
					fullWidth
					disabled={!callId}
					loading={start.isPending}
					onClick={submit}
				>
					Start the chain
				</Button>
			</VStack>
		</Modal>
	)
}
