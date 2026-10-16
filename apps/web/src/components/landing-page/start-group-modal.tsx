import { VStack } from "styled-system/jsx"
import type { StartGroupSurface } from "#/lib/analytics"
import { Modal } from "../ui/modal"
import { StartGroupForm } from "./start-group-form"

type Props = {
	surface: StartGroupSurface
}

// The hero's group form, for every landing page button that isn't next to it.
export function StartGroupModal({ surface }: Props) {
	return (
		<Modal>
			<Modal.CloseButton />
			<VStack gap="1" alignItems="flex-start">
				<Modal.Title>Start a group</Modal.Title>
				<Modal.Description>
					Name it, sign up, and send the invite link. Everyone who joins lands
					on the same leaderboard.
				</Modal.Description>
			</VStack>
			<StartGroupForm surface={surface} autoFocus />
		</Modal>
	)
}
