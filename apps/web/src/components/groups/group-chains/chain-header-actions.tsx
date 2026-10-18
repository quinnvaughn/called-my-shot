import { useQueryClient } from "@tanstack/react-query"
import { HStack } from "styled-system/jsx"
import {
	PresserMenu,
	type PresserMenuAction,
} from "#/components/pressers/presser-menu"
import { Button } from "#/components/ui/button"
import {
	CallOffChainDocument,
	chainErrorMessage,
	invalidateChain,
	LeaveChainDocument,
} from "#/graphql/chains/mutations"
import type { ChainPhase } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { openModal } from "#/stores/modal-store"
import { showToast } from "#/stores/toast-store"
import { JoinChainModal } from "./join-chain-modal"

type Props = {
	chainId: string
	phase: ChainPhase
	viewerIsStarter: boolean
	viewerLinkStatus: "APPROVED" | "REQUESTED" | null
	canJoin: boolean
	starterUsername: string | null
}

// The chain's one main action, and the rest in a menu beside it. Only while
// it's taking links: after that there's nothing left to do to it.
export function ChainHeaderActions({
	chainId,
	phase,
	viewerIsStarter,
	viewerLinkStatus,
	canJoin,
	starterUsername,
}: Props) {
	const leave = useGqlMutation(LeaveChainDocument)
	const callOff = useGqlMutation(CallOffChainDocument)
	const queryClient = useQueryClient()
	if (phase !== "OPEN") return null

	async function run(which: "leave" | "callOff") {
		const result =
			which === "leave"
				? (await leave.mutateAsync({ chainId }))?.leaveChain
				: (await callOff.mutateAsync({ chainId }))?.callOffChain
		if (result?.__typename === "ChainPayload") {
			await invalidateChain(queryClient)
			return
		}
		showToast({ message: chainErrorMessage(result) })
	}

	const menu: PresserMenuAction[] = viewerIsStarter
		? [{ label: "Call it off", danger: true, onSelect: () => run("callOff") }]
		: viewerLinkStatus === "APPROVED"
			? [
					{
						label: "Leave the chain",
						danger: true,
						onSelect: () => run("leave"),
					},
				]
			: viewerLinkStatus === "REQUESTED"
				? [{ label: "Take back my request", onSelect: () => run("leave") }]
				: []

	return (
		<HStack gap="2">
			{canJoin && (
				<Button
					variant="solid"
					onClick={() =>
						openModal(
							<JoinChainModal
								chainId={chainId}
								starterUsername={starterUsername}
							/>,
						)
					}
				>
					Add your link
				</Button>
			)}
			<PresserMenu label="Chain options" actions={menu} />
		</HStack>
	)
}
