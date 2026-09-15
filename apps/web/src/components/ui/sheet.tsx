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
import { sheet as sheetRecipe } from "styled-system/recipes"
import { closeModal } from "#/stores/modal-store"
import { useDialogBehavior } from "./use-dialog-behavior"

type SheetSlots = ReturnType<typeof sheetRecipe>

const SheetContext = createContext<{
	slots: SheetSlots
	titleId: string
} | null>(null)

function useSheetSlots(part: string) {
	const ctx = useContext(SheetContext)
	if (!ctx) {
		throw new Error(`Sheet.${part} must be rendered inside <Sheet>`)
	}
	return ctx
}

// An edge-pinned panel: a bottom sheet below md, a right-hand column from md
// up. Same contract as Modal - opened with openModal(<YourSheet />) where
// YourSheet renders <Sheet> as its root, so mounted means open and
// closeModal() closes it. Being on the modal stack also lets a dialog opened
// from inside the sheet layer on top of it.
function Sheet({ children }: { children: ReactNode }) {
	const panelRef = useRef<HTMLDivElement>(null)
	const titleId = useId()
	const slots = sheetRecipe()

	useDialogBehavior(panelRef)

	return createPortal(
		// biome-ignore lint/a11y/noStaticElementInteractions: click-outside-to-close backdrop; keyboard users close via Escape (useDialogBehavior) or Sheet.CloseButton
		// biome-ignore lint/a11y/useKeyWithClickEvents: see above
		<div
			className={slots.overlay}
			onClick={(event) => {
				if (event.target === event.currentTarget) closeModal()
			}}
		>
			<SheetContext.Provider value={{ slots, titleId }}>
				<div
					ref={panelRef}
					className={slots.panel}
					role="dialog"
					aria-modal="true"
					aria-labelledby={titleId}
					tabIndex={-1}
				>
					<div className={slots.dragHandle} />
					{children}
				</div>
			</SheetContext.Provider>
		</div>,
		document.body,
	)
}

function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	const { slots } = useSheetSlots("Header")
	return <div className={cx(slots.header, className)} {...props} />
}

function SheetTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	const { slots, titleId } = useSheetSlots("Title")
	return <div id={titleId} className={cx(slots.title, className)} {...props} />
}

function SheetCloseButton() {
	const { slots } = useSheetSlots("CloseButton")
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

function SheetBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	const { slots } = useSheetSlots("Body")
	return <div className={cx(slots.body, className)} {...props} />
}

Sheet.Header = SheetHeader
Sheet.Title = SheetTitle
Sheet.CloseButton = SheetCloseButton
Sheet.Body = SheetBody

export { Sheet }
