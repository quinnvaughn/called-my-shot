import {
	type ButtonHTMLAttributes,
	createContext,
	type HTMLAttributes,
	type InputHTMLAttributes,
	type ReactNode,
	useContext,
	useId,
	useState,
} from "react"
import { FiEye, FiEyeOff } from "react-icons/fi"
import { cx, sva } from "styled-system/css"

const textInputRecipe = sva({
	slots: [
		"root",
		"label",
		"group",
		"field",
		"icon",
		"iconButton",
		"description",
		"error",
	],
	base: {
		root: {
			display: "flex",
			flexDirection: "column",
			gap: "1.5",
		},
		label: {
			display: "block",
			fontFamily: "mono",
			fontSize: "2xs",
			letterSpacing: "wide",
			color: "fg.subtle",
			textTransform: "uppercase",
		},
		// The styled surface — border, background, focus ring, error state.
		// The <input> inside it stays bare so icons can share the same box.
		group: {
			display: "flex",
			alignItems: "center",
			gap: "2",
			width: "full",
			backgroundColor: "bg.canvas",
			border: "1px solid",
			borderColor: "border.default",
			borderRadius: "lg",
			paddingInline: "3.5",
			transition: "border-color 0.15s ease",
			_focusWithin: {
				borderColor: "primary.default",
			},
		},
		field: {
			flex: "1",
			minWidth: "0",
			width: "full",
			backgroundColor: "transparent",
			border: "none",
			outline: "none",
			color: "fg.default",
			fontFamily: "inherit",
			fontSize: "sm",
			paddingBlock: "3",
			_placeholder: {
				color: "fg.subtle",
			},
		},
		icon: {
			flexShrink: "0",
			display: "flex",
			alignItems: "center",
			color: "fg.subtle",
		},
		iconButton: {
			flexShrink: "0",
			display: "flex",
			alignItems: "center",
			background: "none",
			border: "none",
			padding: "0",
			cursor: "pointer",
			color: "fg.subtle",
			_hover: {
				color: "fg.default",
			},
		},
		description: {
			fontSize: "xs",
			color: "fg.muted",
		},
		error: {
			fontSize: "xs",
			color: "danger.default",
		},
	},
	variants: {
		error: {
			true: {
				group: {
					borderColor: "danger.default",
				},
			},
		},
	},
})

type TextInputSlots = ReturnType<typeof textInputRecipe>

type TextInputContextValue = {
	slots: TextInputSlots
	fieldId: string
	hasError: boolean
	describedBy: string | undefined
}

const TextInputContext = createContext<TextInputContextValue | null>(null)

function useTextInputContext(part: string) {
	const ctx = useContext(TextInputContext)
	if (!ctx) {
		throw new Error(`TextInput.${part} must be rendered inside <TextInput>`)
	}
	return ctx
}

type TextInputProps = {
	error?: string
	description?: string
	children: ReactNode
}

function TextInput({ error, description, children }: TextInputProps) {
	const fieldId = useId()
	const descriptionId = useId()
	const errorId = useId()
	const hasError = Boolean(error)
	const slots = textInputRecipe({ error: hasError })

	// An error replaces the description rather than stacking under it — same
	// meta line, so only one message is ever describing the field at a time.
	const describedBy = hasError
		? errorId
		: description
			? descriptionId
			: undefined

	return (
		<TextInputContext.Provider
			value={{ slots, fieldId, hasError, describedBy }}
		>
			<div className={slots.root}>
				{children}
				{hasError ? (
					<div id={errorId} role="alert" className={slots.error}>
						{error}
					</div>
				) : (
					description && (
						<div id={descriptionId} className={slots.description}>
							{description}
						</div>
					)
				)}
			</div>
		</TextInputContext.Provider>
	)
}

function TextInputLabel({
	className,
	...props
}: HTMLAttributes<HTMLLabelElement>) {
	const { slots, fieldId } = useTextInputContext("Label")
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: text content comes through {...props}.children at the call site, which biome can't see statically
		<label
			htmlFor={fieldId}
			className={cx(slots.label, className)}
			{...props}
		/>
	)
}

function TextInputGroup({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	const { slots } = useTextInputContext("Group")
	return <div className={cx(slots.group, className)} {...props} />
}

type TextInputFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
	id?: string
}

function TextInputField({ className, ...props }: TextInputFieldProps) {
	const { slots, fieldId, hasError, describedBy } = useTextInputContext("Field")
	return (
		<input
			id={fieldId}
			aria-invalid={hasError || undefined}
			aria-describedby={describedBy}
			className={cx(slots.field, className)}
			{...props}
		/>
	)
}

function TextInputIcon({
	className,
	...props
}: HTMLAttributes<HTMLSpanElement>) {
	const { slots } = useTextInputContext("Icon")
	return <span aria-hidden className={cx(slots.icon, className)} {...props} />
}

type TextInputIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	"aria-label": string
}

function TextInputIconButton({
	className,
	...props
}: TextInputIconButtonProps) {
	const { slots } = useTextInputContext("IconButton")
	return (
		<button
			type="button"
			className={cx(slots.iconButton, className)}
			{...props}
		/>
	)
}

// Field + Group + a built-in visibility toggle, so it drops in anywhere a
// bare Group/Field pair would go without the caller wiring the toggle icon.
function TextInputPassword({ className, ...props }: TextInputFieldProps) {
	const [visible, setVisible] = useState(false)

	return (
		<TextInputGroup>
			<TextInputField
				type={visible ? "text" : "password"}
				className={className}
				{...props}
			/>
			<TextInputIconButton
				aria-label={visible ? "Hide password" : "Show password"}
				onClick={() => setVisible((v) => !v)}
			>
				{visible ? <FiEyeOff size={16} /> : <FiEye size={16} />}
			</TextInputIconButton>
		</TextInputGroup>
	)
}

TextInput.Label = TextInputLabel
TextInput.Group = TextInputGroup
TextInput.Field = TextInputField
TextInput.Icon = TextInputIcon
TextInput.IconButton = TextInputIconButton
TextInput.Password = TextInputPassword

export { TextInput }
