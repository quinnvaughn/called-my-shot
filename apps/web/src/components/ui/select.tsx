import {
	type ButtonHTMLAttributes,
	createContext,
	type HTMLAttributes,
	type ReactNode,
	type RefObject,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { createPortal } from "react-dom"
import { FiCheck, FiChevronDown } from "react-icons/fi"
import { cx } from "styled-system/css"
import { select as selectRecipe } from "styled-system/recipes"

type SelectSlots = ReturnType<typeof selectRecipe>

type DropdownRect = { top: number; left: number; width: number }

type DropdownPanel = {
	open: boolean
	close: () => void
	toggle: () => void
	rootRef: RefObject<HTMLDivElement | null>
	triggerRef: RefObject<HTMLButtonElement | null>
	contentRef: RefObject<HTMLDivElement | null>
	rect: DropdownRect | null
}

// Shared by Select and MultiSelect - open state, outside-click/Escape close,
// and portal position tracking are identical for both; only what clicking an
// option *does* (replace-and-close vs toggle-and-stay-open) differs between
// them, which lives in each one's own Option component instead of here.
function useDropdownPanel(): DropdownPanel {
	const [open, setOpen] = useState(false)
	const rootRef = useRef<HTMLDivElement>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	// Content is portalled to document.body (see DropdownContent) so an
	// ancestor's `overflow: hidden` - e.g. Card - can't clip the dropdown.
	// That moves it outside rootRef's DOM subtree, so the outside-click check
	// below has to know about both nodes, not just rootRef.
	const contentRef = useRef<HTMLDivElement>(null)
	const [rect, setRect] = useState<DropdownRect | null>(null)

	const close = useCallback(() => setOpen(false), [])
	const toggle = useCallback(() => setOpen((v) => !v), [])

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
		// stale under the trigger as the page scrolls. Scrolling *inside* the
		// content itself (a long option list) doesn't count - `scroll` doesn't
		// bubble, but a capture-phase listener on document still sees it fire
		// on that descendant, so without this check the list closes the
		// instant you try to scroll it.
		function onScroll(event: Event) {
			if (contentRef.current?.contains(event.target as Node)) return
			close()
		}
		document.addEventListener("scroll", onScroll, true)
		return () => {
			window.removeEventListener("resize", updateRect)
			document.removeEventListener("scroll", onScroll, true)
		}
	}, [open, close])

	return { open, close, toggle, rootRef, triggerRef, contentRef, rect }
}

type DropdownContentProps = HTMLAttributes<HTMLDivElement> & {
	slots: SelectSlots
	panel: DropdownPanel
}

// Portalled to document.body and positioned from the trigger's own bounding
// rect (fixed, not the recipe's default absolute/top/left/right) rather than
// living inside the root - otherwise an ancestor with `overflow: hidden`
// (Card, most commonly) clips it instead of letting it float above the page
// like a dropdown should. Shared rendering for Select.Content and
// MultiSelect.Content.
function DropdownContent({
	slots,
	panel,
	className,
	style,
	...props
}: DropdownContentProps) {
	const { open, rect, contentRef } = panel
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

// ---- Select: single value, picking an option replaces it and closes ----

// biome-ignore lint/suspicious/noExplicitAny: a single module-level context has to erase T - each hook call site below re-applies its own caller's T.
type AnySelectContextValue = SelectContextValue<any>

type SelectContextValue<T extends string> = {
	slots: SelectSlots
	panel: DropdownPanel
	value: T
	onValueChange: (value: T) => void
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
	const panel = useDropdownPanel()
	const hasError = Boolean(error)
	const slots = useMemo(
		() => selectRecipe({ open: panel.open, hasError }),
		[panel.open, hasError],
	)

	return (
		<SelectContext.Provider value={{ slots, panel, value, onValueChange }}>
			<div ref={panel.rootRef} className={cx(slots.root, className)} {...props}>
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
	const { slots, panel } = useSelectContext("Trigger")
	return (
		<button
			ref={panel.triggerRef}
			type="button"
			aria-haspopup="listbox"
			aria-expanded={panel.open}
			className={cx(slots.trigger, className)}
			onClick={panel.toggle}
			{...props}
		>
			<span className={slots.triggerLabel}>{children}</span>
			<FiChevronDown size={12} className={slots.caret} />
		</button>
	)
}

type SelectContentProps = HTMLAttributes<HTMLDivElement>

function SelectContent(props: SelectContentProps) {
	const { slots, panel } = useSelectContext("Content")
	return <DropdownContent slots={slots} panel={panel} {...props} />
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
	const { value, onValueChange, panel } = useSelectContext<T>("Option")
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
				panel.close()
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

// ---- MultiSelect: "IN" filtering - picking an option toggles it in place,
// the panel stays open so more than one can be picked in a row ----

// biome-ignore lint/suspicious/noExplicitAny: same reasoning as AnySelectContextValue above.
type AnyMultiSelectContextValue = MultiSelectContextValue<any>

type MultiSelectContextValue<T extends string> = {
	slots: SelectSlots
	panel: DropdownPanel
	value: T[]
	onValueChange: (value: T[]) => void
}

const MultiSelectContext = createContext<AnyMultiSelectContextValue | null>(
	null,
)

function useMultiSelectContext<T extends string>(
	part: string,
): MultiSelectContextValue<T> {
	const ctx = useContext(MultiSelectContext)
	if (!ctx) {
		throw new Error(`MultiSelect.${part} must be rendered inside <MultiSelect>`)
	}
	return ctx
}

type MultiSelectProps<T extends string> = Omit<
	HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	value: T[]
	onValueChange: (value: T[]) => void
	children: ReactNode
	description?: string
	error?: string
}

function MultiSelect<T extends string>({
	value,
	onValueChange,
	className,
	children,
	description,
	error,
	...props
}: MultiSelectProps<T>) {
	const panel = useDropdownPanel()
	const hasError = Boolean(error)
	const slots = useMemo(
		() => selectRecipe({ open: panel.open, hasError }),
		[panel.open, hasError],
	)

	return (
		<MultiSelectContext.Provider value={{ slots, panel, value, onValueChange }}>
			<div ref={panel.rootRef} className={cx(slots.root, className)} {...props}>
				{children}
				{hasError ? (
					<div role="alert" className={slots.error}>
						{error}
					</div>
				) : (
					description && <div className={slots.description}>{description}</div>
				)}
			</div>
		</MultiSelectContext.Provider>
	)
}

type MultiSelectTriggerProps = Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	"children"
> & {
	children: ReactNode
}

// Same trigger chrome as Select.Trigger - the caller composes the summary
// label text from its own selected-values array (e.g. "SP, RP" or "6
// selected"), same as Select's caller composes its single-value label.
function MultiSelectTrigger({
	className,
	children,
	...props
}: MultiSelectTriggerProps) {
	const { slots, panel } = useMultiSelectContext("Trigger")
	return (
		<button
			ref={panel.triggerRef}
			type="button"
			aria-haspopup="listbox"
			aria-expanded={panel.open}
			className={cx(slots.trigger, className)}
			onClick={panel.toggle}
			{...props}
		>
			<span className={slots.triggerLabel}>{children}</span>
			<FiChevronDown size={12} className={slots.caret} />
		</button>
	)
}

type MultiSelectContentProps = HTMLAttributes<HTMLDivElement>

function MultiSelectContent(props: MultiSelectContentProps) {
	const { slots, panel } = useMultiSelectContext("Content")
	return <DropdownContent slots={slots} panel={panel} {...props} />
}

function MultiSelectGroupLabel({ children }: { children: ReactNode }) {
	const { slots } = useMultiSelectContext("GroupLabel")
	return <div className={slots.groupLabel}>{children}</div>
}

type MultiSelectOptionProps<T extends string> = Omit<
	ButtonHTMLAttributes<HTMLButtonElement>,
	"value" | "children"
> & {
	value: T
	children: ReactNode
}

function MultiSelectOption<T extends string>({
	value: optionValue,
	className,
	children,
	...props
}: MultiSelectOptionProps<T>) {
	const { value, onValueChange } = useMultiSelectContext<T>("Option")
	const isActive = value.includes(optionValue)
	const { option } = selectRecipe({ active: isActive })
	return (
		<button
			type="button"
			role="option"
			aria-selected={isActive}
			className={cx(option, className)}
			onClick={() => {
				onValueChange(
					isActive
						? value.filter((v) => v !== optionValue)
						: [...value, optionValue],
				)
			}}
			{...props}
		>
			<span>{children}</span>
			{isActive && (
				<FiCheck size={12} style={{ marginLeft: "auto", flexShrink: 0 }} />
			)}
		</button>
	)
}

MultiSelect.Trigger = MultiSelectTrigger
MultiSelect.Content = MultiSelectContent
MultiSelect.GroupLabel = MultiSelectGroupLabel
MultiSelect.Option = MultiSelectOption

export { MultiSelect, Select }
