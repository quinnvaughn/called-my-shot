import {
	createContext,
	type HTMLAttributes,
	type ReactNode,
	type TextareaHTMLAttributes,
	useContext,
	useId,
} from "react"
import { cx } from "styled-system/css"
import { textarea as textareaRecipe } from "styled-system/recipes"
import { RequiredMark } from "./required-mark"

type TextareaSlots = ReturnType<typeof textareaRecipe>

type TextareaContextValue = {
	slots: TextareaSlots
	fieldId: string
	hasError: boolean
	describedBy: string | undefined
}

const TextareaContext = createContext<TextareaContextValue | null>(null)

function useTextareaContext(part: string) {
	const ctx = useContext(TextareaContext)
	if (!ctx) {
		throw new Error(`Textarea.${part} must be rendered inside <Textarea>`)
	}
	return ctx
}

type TextareaProps = {
	className?: string
	error?: string
	description?: string
	children: ReactNode
}

function Textarea({ className, error, description, children }: TextareaProps) {
	const fieldId = useId()
	const descriptionId = useId()
	const errorId = useId()
	const hasError = Boolean(error)
	const slots = textareaRecipe({ error: hasError })

	// An error replaces the description rather than stacking under it - same
	// meta line, so only one message is ever describing the field at a time.
	const describedBy = hasError
		? errorId
		: description
			? descriptionId
			: undefined

	return (
		<TextareaContext.Provider value={{ slots, fieldId, hasError, describedBy }}>
			<div className={cx(slots.root, className)}>
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
		</TextareaContext.Provider>
	)
}

type TextareaLabelProps = HTMLAttributes<HTMLLabelElement> & {
	required?: boolean
}

function TextareaLabel({
	className,
	required,
	children,
	...props
}: TextareaLabelProps) {
	const { slots, fieldId } = useTextareaContext("Label")
	return (
		<label htmlFor={fieldId} className={cx(slots.label, className)} {...props}>
			{children}
			{required && <RequiredMark />}
		</label>
	)
}

type TextareaFieldProps = Omit<
	TextareaHTMLAttributes<HTMLTextAreaElement>,
	"id"
> & {
	id?: string
}

function TextareaField({ className, ...props }: TextareaFieldProps) {
	const { slots, fieldId, hasError, describedBy } = useTextareaContext("Field")
	return (
		<textarea
			id={fieldId}
			aria-invalid={hasError || undefined}
			aria-describedby={describedBy}
			className={cx(slots.field, className)}
			{...props}
		/>
	)
}

Textarea.Label = TextareaLabel
Textarea.Field = TextareaField

export { Textarea }
