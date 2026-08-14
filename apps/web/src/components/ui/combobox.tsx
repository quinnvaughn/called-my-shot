import {
	type ButtonHTMLAttributes,
	createContext,
	type HTMLAttributes,
	type ReactNode,
	useContext,
} from "react"
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

function Combobox({
	open,
	highlightedKey,
	onHighlightChange,
	onSelect,
	className,
	children,
}: ComboboxProps) {
	const slots = comboboxRecipe()
	if (!open) return null
	return (
		<ComboboxContext.Provider
			value={{ slots, highlightedKey, onHighlightChange, onSelect }}
		>
			<div role="listbox" className={cx(slots.content, className)}>
				{children}
			</div>
		</ComboboxContext.Provider>
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
