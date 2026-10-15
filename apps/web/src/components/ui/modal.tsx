import {
	createContext,
	type HTMLAttributes,
	type ReactNode,
	useContext,
	useId,
	useRef,
} from "react"
import { createPortal } from "react-dom"
import { FiX } from "react-icons/fi"
import { cx } from "styled-system/css"
import { modal as modalRecipe } from "styled-system/recipes"
import { closeModal } from "#/stores/modal-store"
import { useDialogBehavior } from "./use-dialog-behavior"

type ModalSlots = ReturnType<typeof modalRecipe>

const ModalContext = createContext<{
	slots: ModalSlots
	titleId: string
	dismiss: () => void
} | null>(null)

function useModalSlots(part: string) {
	const ctx = useContext(ModalContext)
	if (!ctx) {
		throw new Error(`Modal.${part} must be rendered inside <Modal>`)
	}
	return ctx
}

type ModalProps = {
	children: ReactNode
	size?: "sm" | "md"
	// Runs when the viewer dismisses the modal themselves: the backdrop,
	// Escape, or the close button. Not when something else unmounts it (a
	// navigation, another modal stacked on top), and not when the modal's
	// own buttons call closeModal - those know what they're doing already.
	onClose?: () => void
}

// The portal/overlay/box/focus-trap chrome. Used directly at the root of each
// modal's own content component — <Modal> only ever renders because it's the
// content ModalHost pulled out of the store, so its mount *is* "open", and its
// unmount (via useDialogBehavior's cleanup) is "closed". No separate isOpen
// check needed.
function Modal({ children, size = "sm", onClose }: ModalProps) {
	const boxRef = useRef<HTMLDivElement>(null)
	const titleId = useId()
	const slots = modalRecipe({ size })

	function dismiss() {
		onClose?.()
		closeModal()
	}

	useDialogBehavior(boxRef, dismiss)

	return createPortal(
		// biome-ignore lint/a11y/noStaticElementInteractions: click-outside-to-close backdrop; keyboard users close via Escape (useDialogBehavior) or Modal.CloseButton
		// biome-ignore lint/a11y/useKeyWithClickEvents: see above
		<div
			className={slots.overlay}
			onClick={(event) => {
				if (event.target === event.currentTarget) dismiss()
			}}
		>
			<ModalContext.Provider value={{ slots, titleId, dismiss }}>
				<div
					ref={boxRef}
					className={slots.box}
					role="dialog"
					aria-modal="true"
					aria-labelledby={titleId}
					tabIndex={-1}
				>
					{children}
				</div>
			</ModalContext.Provider>
		</div>,
		document.body,
	)
}

function ModalCloseButton() {
	const { slots, dismiss } = useModalSlots("CloseButton")
	return (
		<button
			type="button"
			className={slots.closeButton}
			aria-label="Close"
			onClick={dismiss}
		>
			<FiX size={16} />
		</button>
	)
}

function ModalTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	const { slots, titleId } = useModalSlots("Title")
	return <div id={titleId} className={cx(slots.title, className)} {...props} />
}

function ModalDescription({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	const { slots } = useModalSlots("Description")
	return <div className={cx(slots.description, className)} {...props} />
}

Modal.CloseButton = ModalCloseButton
Modal.Title = ModalTitle
Modal.Description = ModalDescription

export { Modal }
