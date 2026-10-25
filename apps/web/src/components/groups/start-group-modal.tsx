import { VStack } from "styled-system/jsx"
import { Modal } from "#/components/ui/modal"
import type { StartGroupSurface } from "#/lib/analytics"
import { StartGroupForm } from "./start-group-form"

type Props = {
	surface: StartGroupSurface
}

// The name-it-first group form, for a signed-out visitor away from Home's
// intro: the rail's New group tile, the Spaces page, an arcade game's end.
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
			<StartGroupForm surface={surface} autoFocus stacked />
		</Modal>
	)
}
