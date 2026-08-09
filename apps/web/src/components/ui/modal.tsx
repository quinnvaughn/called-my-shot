import { useStore } from "@tanstack/react-store"
import {
	createContext,
	type HTMLAttributes,
	type ReactNode,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
} from "react"
import { createPortal } from "react-dom"
import { FiX } from "react-icons/fi"
import { cx, sva } from "styled-system/css"
import { closeModal, modalStore } from "#/stores/modal-store"

const FOCUSABLE_SELECTOR =
	"input, button, [href], select, textarea, [tabindex]:not([tabindex='-1'])"

const modalRecipe = sva({
	slots: ["overlay", "box", "closeButton", "title", "description"],
	base: {
		overlay: {
			position: "fixed",
			inset: 0,
			zIndex: "100",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			padding: "5",
			backgroundColor: "bg.overlay/70",
			backdropFilter: "blur(6px)",
		},
		box: {
			position: "relative",
			display: "flex",
			flexDirection: "column",
			gap: "5.5",
			width: "full",
			maxWidth: "sm",
			backgroundColor: "bg.surface",
			border: "1px solid",
			borderColor: "border.default",
			borderRadius: "2xl",
			padding: "7",
			boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
		},
		closeButton: {
			position: "absolute",
			top: "3.5",
			right: "3.5",
			width: "8",
			height: "8",
			borderRadius: "full",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			color: "fg.muted",
			_hover: {
				backgroundColor: "bg.subtle",
				color: "fg.default",
				cursor: "pointer",
			},
		},
		title: {
			fontFamily: "heading",
			fontSize: "xl",
		},
		description: {
			fontSize: "xs",
			color: "fg.muted",
		},
	},
})

type ModalSlots = ReturnType<typeof modalRecipe>

const ModalContext = createContext<{
	slots: ModalSlots
	titleId: string
} | null>(null)

function useModalSlots(part: string) {
	const ctx = useContext(ModalContext)
	if (!ctx) {
		throw new Error(`Modal.${part} must be rendered inside <Modal>`)
	}
	return ctx
}

type ModalProps = { children: ReactNode }

// The portal/overlay/box/focus-trap chrome. Used directly at the root of each
// modal's own content component — <Modal> only ever renders because it's the
// content ModalHost pulled out of the store, so its mount *is* "open", and its
// unmount (via cleanup below) is "closed". No separate isOpen check needed.
function Modal({ children }: ModalProps) {
	const boxRef = useRef<HTMLDivElement>(null)
	const lastFocusedRef = useRef<HTMLElement | null>(null)
	const titleId = useId()
	const slots = useMemo(() => modalRecipe(), [])

	useEffect(() => {
		lastFocusedRef.current = document.activeElement as HTMLElement | null
		document.body.style.overflow = "hidden"

		const focusTarget =
			boxRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
			boxRef.current
		focusTarget?.focus()

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") closeModal()
		}
		document.addEventListener("keydown", onKeyDown)

		return () => {
			document.body.style.overflow = ""
			document.removeEventListener("keydown", onKeyDown)
			lastFocusedRef.current?.focus()
		}
	}, [])

	return createPortal(
		// biome-ignore lint/a11y/noStaticElementInteractions: click-outside-to-close backdrop; keyboard users close via Escape (handled above) or Modal.CloseButton
		// biome-ignore lint/a11y/useKeyWithClickEvents: see above
		<div
			className={slots.overlay}
			onClick={(event) => {
				if (event.target === event.currentTarget) closeModal()
			}}
		>
			<ModalContext.Provider value={{ slots, titleId }}>
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
	const { slots } = useModalSlots("CloseButton")
	return (
		<button
			type="button"
			className={slots.closeButton}
			aria-label="Close"
			onClick={closeModal}
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

// Mounted once at the app root. Purely renders whatever's in modalStore —
// opening a modal is openModal(<YourModal />), where YourModal renders
// <Modal>...</Modal> as its own root. ModalHost never needs to change when a
// new modal is added.
export function ModalHost() {
	return useStore(modalStore, (state) => state)
}
