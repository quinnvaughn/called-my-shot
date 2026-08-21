import {
	type ButtonHTMLAttributes,
	createContext,
	type HTMLAttributes,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react"
import { createPortal } from "react-dom"
import { cx } from "styled-system/css"
import { combobox as comboboxRecipe } from "styled-system/recipes"

type ComboboxSlots = ReturnType<typeof comboboxRecipe>

type ComboboxContextValue = {
	slots: ComboboxSlots
	highlightedKey: string | null
	onHighlightChange: (key: string) => void
	onSelect: (key: string) => void
}

const ComboboxContext = createContext<ComboboxContextValue | null>(null)

function useComboboxContext(part: string) {
	const ctx = useContext(ComboboxContext)
	if (!ctx) {
		throw new Error(`Combobox.${part} must be rendered inside <Combobox>`)
	}
	return ctx
}

type ComboboxProps = {
	open: boolean
	// The caller (a text input, typically) owns which row is highlighted and
	// keyboard nav - this only renders the floating panel and reacts to
	// hover/click. Focus stays on the input the whole time (an
	// aria-activedescendant listbox, not a focusable menu), so there's no
	// keydown handling to own here.
	highlightedKey: string | null
	onHighlightChange: (key: string) => void
	onSelect: (key: string) => void
	className?: string
	children: ReactNode
}

// Portalled to document.body and positioned (fixed, not the recipe's default
// absolute/top/left/right) from a zero-height marker rendered right here in
// the caller's own layout - same reasoning as Select.Content: living inside
// the input's DOM subtree means an ancestor with `overflow: hidden` (Card,
// most commonly) clips it, or a sibling card painted later in the DOM sits
// above it despite zIndex. The marker (not a ref the caller has to wire up)
// is what makes this a drop-in replacement for the old inline-absolute
// version - it lands in the same spot the old absolutely-positioned panel
// did, since it's a normal-flow sibling of whatever came right before
// <Combobox> (typically the input), full width of that shared parent.
function Combobox({
	open,
	highlightedKey,
	onHighlightChange,
	onSelect,
	className,
	children,
}: ComboboxProps) {
	const slots = comboboxRecipe()
	const markerRef = useRef<HTMLDivElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)
	const [rect, setRect] = useState<{
		top: number
		left: number
		width: number
	} | null>(null)

	useEffect(() => {
		if (!open) return

		function updateRect() {
			const el = markerRef.current
			if (!el) return
			const r = el.getBoundingClientRect()
			setRect({ top: r.bottom + 6, left: r.left, width: r.width })
		}
		updateRect()
		window.addEventListener("resize", updateRect)
		// Combobox doesn't own `open` (the caller does, via the input's
		// focus/blur), so unlike Select.Content there's no close() to call here
		// - the panel has to follow the anchor on scroll instead of dismissing,
		// or it'd go stale under a fixed position as the page moves. Scrolling
		// *inside* the panel itself (a long option list) doesn't count.
		function onScroll(event: Event) {
			if (contentRef.current?.contains(event.target as Node)) return
			updateRect()
		}
		document.addEventListener("scroll", onScroll, true)
		return () => {
			window.removeEventListener("resize", updateRect)
			document.removeEventListener("scroll", onScroll, true)
		}
	}, [open])

	return (
		<>
			<div ref={markerRef} style={{ height: 0 }} />
			{open &&
				rect &&
				createPortal(
					<ComboboxContext.Provider
						value={{ slots, highlightedKey, onHighlightChange, onSelect }}
					>
						<div
							ref={contentRef}
							role="listbox"
							className={cx(slots.content, className)}
							style={{
								position: "fixed",
								top: rect.top,
								left: rect.left,
								width: rect.width,
								right: "auto",
							}}
						>
							{children}
						</div>
					</ComboboxContext.Provider>,
					document.body,
				)}
		</>
	)
}

type ComboboxGroupProps = {
	label: string
	action?: ReactNode
	children: ReactNode
}

function ComboboxGroup({ label, action, children }: ComboboxGroupProps) {
	const { slots } = useComboboxContext("Group")
	return (
		<div>
			<div className={slots.groupLabel}>
				<span>{label}</span>
				{action}
			</div>
			{children}
		</div>
	)
}

type ComboboxOptionProps = Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	"children"
> & {
	optionKey: string
	icon?: ReactNode
	meta?: ReactNode
	children: ReactNode
}

function ComboboxOption({
	optionKey,
	icon,
	meta,
	className,
	children,
	...props
}: ComboboxOptionProps) {
	const { slots, highlightedKey, onHighlightChange, onSelect } =
		useComboboxContext("Option")
	const highlighted = highlightedKey === optionKey
	const { option } = comboboxRecipe({ highlighted })
	return (
		<button
			type="button"
			role="option"
			id={`combobox-option-${optionKey}`}
			aria-selected={highlighted}
			className={cx(option, className)}
			onMouseEnter={() => onHighlightChange(optionKey)}
			onClick={() => onSelect(optionKey)}
			{...props}
		>
			{icon && <span className={slots.optionIcon}>{icon}</span>}
			<span className={slots.optionText}>{children}</span>
			{meta && <span className={slots.optionMeta}>{meta}</span>}
		</button>
	)
}

type ComboboxEmptyProps = HTMLAttributes<HTMLDivElement>

function ComboboxEmpty({ className, ...props }: ComboboxEmptyProps) {
	const { slots } = useComboboxContext("Empty")
	return <div className={cx(slots.empty, className)} {...props} />
}

Combobox.Group = ComboboxGroup
Combobox.Option = ComboboxOption
Combobox.Empty = ComboboxEmpty

export { Combobox }
