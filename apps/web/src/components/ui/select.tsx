import {
	type ButtonHTMLAttributes,
	createContext,
	type HTMLAttributes,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
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
}

// Controlled value (like Tabs) - the caller owns *what's* selected, this only
// owns whether the panel of other choices is open right now (like Dropdown).
function Select<T extends string>({
	value,
	onValueChange,
	className,
	children,
	...props
}: SelectProps<T>) {
	const [open, setOpen] = useState(false)
	const rootRef = useRef<HTMLDivElement>(null)
	const slots = useMemo(() => selectRecipe({ open }), [open])

	const close = () => setOpen(false)
	const toggle = () => setOpen((v) => !v)

	useEffect(() => {
		if (!open) return

		function onPointerDown(event: MouseEvent) {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
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
			value={{ slots, open, close, toggle, value, onValueChange }}
		>
			<div ref={rootRef} className={cx(slots.root, className)} {...props}>
				{children}
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
	const { slots, open, toggle } = useSelectContext("Trigger")
	return (
		<button
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

function SelectContent({ className, ...props }: SelectContentProps) {
	const { slots, open } = useSelectContext("Content")
	if (!open) return null
	return (
		<div role="listbox" className={cx(slots.content, className)} {...props} />
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
