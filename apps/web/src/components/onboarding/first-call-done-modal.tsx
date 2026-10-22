import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button, button } from "#/components/ui/button"
import { Modal } from "#/components/ui/modal"
import { closeModal } from "#/stores/modal-store"

type Props = {
	// Whatever this particular question resolves against - "ESPN box score",
	// "MLB Stats API", whatever the creator set. Passed in rather than written
	// into the copy, since it differs per question.
	resolutionSource: string
}

// The last beat of the walkthrough. Answers the two questions someone always
// has right after their first call ("can I change it?" and "when do I find
// out?") and then gets out of the way. It deliberately does not hand off into
// starting a group or posting a question: those are things the app offers, not
// things it needs.
//
// Laid out like ConfirmCallModal - full-width actions stacked - rather than a
// row of side-by-side buttons, which is not a shape this app's modals use.
export function FirstCallDoneModal({ resolutionSource }: Props) {
	return (
		<Modal size="md">
			<Modal.CloseButton />
			<VStack gap="2" alignItems="flex-start">
				<Modal.Title>That's a call</Modal.Title>
				<Modal.Description>
					It's in, and anyone can see your pick. To change it before the
					question locks, spend a redo. You earn them by inviting people.
				</Modal.Description>
				<p
					className={css({
						fontSize: "xs",
						lineHeight: "relaxed",
						color: "fg.muted",
					})}
				>
					It scores once the result is official, from {resolutionSource}. Your
					points and accuracy update then.
				</p>
			</VStack>

			<VStack gap="2" alignItems="stretch">
				<Button variant="solid" size="lg" fullWidth onClick={closeModal}>
					Got it
				</Button>
				{/* light, not outline or ghost: both of those render with no fill,
				    and outline additionally switches to mono, which reads as
				    stray text under a heading-font primary rather than as a
				    second button. light is the same treatment as solid in
				    ink-on-paper instead of the brand accent. */}
				<Link
					to="/my-calls"
					onClick={closeModal}
					className={button({
						variant: "light",
						size: "lg",
						fullWidth: true,
					})}
				>
					See my calls
				</Link>
			</VStack>
		</Modal>
	)
}
