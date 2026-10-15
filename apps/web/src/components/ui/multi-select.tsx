import {
	type ButtonHTMLAttributes,
	createContext,
	type HTMLAttributes,
	type ReactNode,
	useContext,
} from "react"
import { FiCheck, FiChevronDown } from "react-icons/fi"
import { cx } from "styled-system/css"
import { select as selectRecipe } from "styled-system/recipes"
import {
	type DropdownPanel,
	SelectDropdownContent,
	type SelectSlots,
	useDropdownPanel,
} from "./select-dropdown-content"

// biome-ignore lint/suspicious/noExplicitAny: a single module-level context has to erase T - each hook call site below re-applies its own caller's T.
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

// "IN" filtering: picking an option toggles it in place, and the panel stays
// open so more than one can be picked in a row.
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
	const slots = selectRecipe({ open: panel.open, hasError })

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
	return <SelectDropdownContent slots={slots} panel={panel} {...props} />
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

export { MultiSelect }
