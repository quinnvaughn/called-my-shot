import { match } from "ts-pattern"
import { FadeCallModal } from "#/components/questions/fade-call-modal/fade-call-modal"
import type { FadeCallModalProps } from "#/components/questions/fade-call-modal/types"
import { PromptCta } from "#/components/ui/prompt-cta"
import { openModal } from "#/stores/modal-store"

// The offer to bet against this call. For a signed-in viewer on someone
// else's open call this is the one thing the page asks them to do, so it gets
// the same weight CallSignupCta gives a signed-out visitor, in the same spot.
// Only rendered when the API says the viewer could fade it (see
// Call.fadeOffer).
export function FadeCta(props: FadeCallModalProps) {
	const sub = match(props.mode)
		.with(
			"NEW",
			() =>
				`Take ${props.pickLabel} against them. Your call scores like any other, and it's listed under their Doubters.`,
		)
		.with(
			"ATTACH",
			() =>
				`Your ${props.pickLabel} call is already on the other side. Aim it at them and it's listed under their Doubters.`,
		)
		.exhaustive()

	return (
		<PromptCta
			prompt={`Think @${props.opUsername} is wrong?`}
			sub={sub}
			action={`Fade @${props.opUsername}`}
			onAction={() => openModal(<FadeCallModal {...props} />)}
		/>
	)
}
