import {
	type ButtonHTMLAttributes,
	createContext,
	type HTMLAttributes,
	type ReactNode,
	useContext,
} from "react"
import { FiChevronDown } from "react-icons/fi"
import { cx } from "styled-system/css"
import { select as selectRecipe } from "styled-system/recipes"
import {
	type DropdownPanel,
	SelectDropdownContent,
	type SelectSlots,
	useDropdownPanel,
} from "./select-dropdown-content"

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
	const slots = selectRecipe({ open: panel.open, hasError })

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
	return <SelectDropdownContent slots={slots} panel={panel} {...props} />
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

export { Select }
