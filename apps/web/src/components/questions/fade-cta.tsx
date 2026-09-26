import { css } from "styled-system/css"
import { Flex, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"
import { FadeCallModal, type FadeCallModalProps } from "./fade-call-modal"

const promptClass = css({
	fontSize: "md",
	fontWeight: "semibold",
	color: "fg.default",
})

const subClass = css({
	fontSize: "sm",
	color: "fg.muted",
})

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
		<Flex
			direction={{ base: "column", sm: "row" }}
			gap="4"
			alignItems={{ base: "stretch", sm: "center" }}
			justify="space-between"
			className={css({
				padding: "5",
				borderRadius: "lg",
				border: "1px solid {colors.border.default}",
				background: "bg.subtle",
			})}
		>
			<VStack gap="1" alignItems="flex-start">
				<span className={promptClass}>Think @{props.opUsername} is wrong?</span>
				<span className={subClass}>{sub}</span>
			</VStack>
			<Button
				variant="solid"
				size="md"
				onClick={() => openModal(<FadeCallModal {...props} />)}
			>
				Fade @{props.opUsername}
			</Button>
		</Flex>
	)
}
