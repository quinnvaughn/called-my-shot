import {
	type ButtonHTMLAttributes,
	createContext,
	type HTMLAttributes,
	type ReactNode,
	type RefObject,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { createPortal } from "react-dom"
import { FiChevronDown } from "react-icons/fi"
import { cx } from "styled-system/css"
import { select as selectRecipe } from "styled-system/recipes"

type SelectSlots = ReturnType<typeof selectRecipe>

// biome-ignore lint/suspicious/noExplicitAny: a single module-level context has to erase T - each hook call site below re-applies its own caller's T.
type AnySelectContextValue = SelectContextValue<any>

type SelectContextValue<T extends string> = {
	slots: SelectSlots
	open: boolean
	close: () => void
	toggle: () => void
	value: T
	onValueChange: (value: T) => void
	triggerRef: RefObject<HTMLButtonElement | null>
	contentRef: RefObject<HTMLDivElement | null>
}

const SelectContext = createContext<AnySelectContextValue | null>(null)

function useSelectContext<T extends string>(
	part: string,
): SelectContextValue<T> {
	const ctx = useContext(SelectContext)
	if (!ctx) {
		throw new Error(`Select.${part} must be rendered inside <Select>`)
	}
	return ctx
}

type SelectProps<T extends string> = Omit<
	HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	value: T
	onValueChange: (value: T) => void
	children: ReactNode
	description?: string
	error?: string
}

// Controlled value (like Tabs) - the caller owns *what's* selected, this only
// owns whether the panel of other choices is open right now (like Dropdown).
function Select<T extends string>({
	value,
	onValueChange,
	className,
	children,
	description,
	error,
	...props
}: SelectProps<T>) {
	const [open, setOpen] = useState(false)
	const rootRef = useRef<HTMLDivElement>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	// Content is portalled to document.body (see SelectContent) so an
	// ancestor's `overflow: hidden` - e.g. Card - can't clip the dropdown.
	// That moves it outside rootRef's DOM subtree, so the outside-click check
	// below has to know about both nodes, not just rootRef.
	const contentRef = useRef<HTMLDivElement>(null)
	const hasError = Boolean(error)
	const slots = useMemo(
		() => selectRecipe({ open, hasError }),
		[open, hasError],
	)

	const close = () => setOpen(false)
	const toggle = () => setOpen((v) => !v)

	useEffect(() => {
		if (!open) return

		function onPointerDown(event: MouseEvent) {
			const target = event.target as Node
			if (
				!rootRef.current?.contains(target) &&
				!contentRef.current?.contains(target)
			) {
				setOpen(false)
			}
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") setOpen(false)
		}
		document.addEventListener("mousedown", onPointerDown)
		document.addEventListener("keydown", onKeyDown)
		return () => {
			document.removeEventListener("mousedown", onPointerDown)
			document.removeEventListener("keydown", onKeyDown)
		}
	}, [open])

	return (
		<SelectContext.Provider
			value={{
				slots,
				open,
				close,
				toggle,
				value,
				onValueChange,
				triggerRef,
				contentRef,
			}}
		>
			<div ref={rootRef} className={cx(slots.root, className)} {...props}>
				{children}
				{hasError ? (
					<div role="alert" className={slots.error}>
						{error}
					</div>
				) : (
					description && <div className={slots.description}>{description}</div>
				)}
			</div>
		</SelectContext.Provider>
	)
}

type SelectTriggerProps = Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	"children"
> & {
	children: ReactNode
}

function SelectTrigger({ className, children, ...props }: SelectTriggerProps) {
	const { slots, open, toggle, triggerRef } = useSelectContext("Trigger")
	return (
		<button
			ref={triggerRef}
			type="button"
			aria-haspopup="listbox"
			aria-expanded={open}
			className={cx(slots.trigger, className)}
			onClick={toggle}
			{...props}
		>
			<span className={slots.triggerLabel}>{children}</span>
			<FiChevronDown size={12} className={slots.caret} />
		</button>
	)
}

type SelectContentProps = HTMLAttributes<HTMLDivElement>

// Portalled to document.body and positioned from the trigger's own
// bounding rect (fixed, not the recipe's default absolute/top/left/right)
// rather than living inside the Select root - otherwise an ancestor with
// `overflow: hidden` (Card, most commonly) clips it instead of letting it
// float above the page like a dropdown should.
function SelectContent({ className, style, ...props }: SelectContentProps) {
	const { slots, open, close, triggerRef, contentRef } =
		useSelectContext("Content")
	const [rect, setRect] = useState<{
		top: number
		left: number
		width: number
	} | null>(null)

	useEffect(() => {
		if (!open) return

		function updateRect() {
			const el = triggerRef.current
			if (!el) return
			const r = el.getBoundingClientRect()
			setRect({ top: r.bottom + 6, left: r.left, width: r.width })
		}
		updateRect()
		window.addEventListener("resize", updateRect)
		// No scroll-follow - closing on scroll is the same tradeoff every other
		// lightweight popover in this file makes (Combobox, Dropdown), just
		// applied here too since a fixed-position portal would otherwise go
		// stale under the trigger as the page scrolls.
		function onScroll() {
			close()
		}
		document.addEventListener("scroll", onScroll, true)
		return () => {
			window.removeEventListener("resize", updateRect)
			document.removeEventListener("scroll", onScroll, true)
		}
	}, [open, triggerRef, close])

	if (!open || !rect) return null

	return createPortal(
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
				...style,
			}}
			{...props}
		/>,
		document.body,
	)
}

function SelectGroupLabel({ children }: { children: ReactNode }) {
	const { slots } = useSelectContext("GroupLabel")
	return <div className={slots.groupLabel}>{children}</div>
}

type SelectOptionProps<T extends string> = Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	"value" | "children"
> & {
	value: T
	children: ReactNode
}

function SelectOption<T extends string>({
	value: optionValue,
	className,
	children,
	...props
}: SelectOptionProps<T>) {
	const { value, onValueChange, close } = useSelectContext<T>("Option")
	const isActive = value === optionValue
	const { option } = selectRecipe({ active: isActive })
	return (
		<button
			type="button"
			role="option"
			aria-selected={isActive}
			className={cx(option, className)}
			onClick={() => {
				onValueChange(optionValue)
				close()
			}}
			{...props}
		>
			{children}
		</button>
	)
}

Select.Trigger = SelectTrigger
Select.Content = SelectContent
Select.GroupLabel = SelectGroupLabel
Select.Option = SelectOption

export { Select }
