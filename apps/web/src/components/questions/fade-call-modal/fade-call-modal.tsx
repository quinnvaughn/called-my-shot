import { match } from "ts-pattern"
import { Modal } from "#/components/ui/modal"
import { AttachFade } from "./attach-fade"
import { NewFade } from "./new-fade"
import type { FadeCallModalProps } from "./types"

// A fade from the call page. NEW casts a call on the other side with the pick
// fixed; ATTACH aims a call the viewer already has on the other side.
export function FadeCallModal(props: FadeCallModalProps) {
	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Fade @{props.opUsername}</Modal.Title>
			{match(props.mode)
				.with("NEW", () => <NewFade {...props} />)
				.with("ATTACH", () => <AttachFade {...props} />)
				.exhaustive()}
		</Modal>
	)
}
