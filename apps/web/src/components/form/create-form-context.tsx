import * as React from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import type { z } from "zod"
import { ChipButton } from "#/components/ui/chip-button"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import { MultiSelect } from "#/components/ui/multi-select"
import { TextInput } from "#/components/ui/text-input"
import { ToggleRow } from "#/components/ui/toggle-row"
import type {
	ArrayPath,
	FieldArrayProps,
	FieldProps,
	FormApi,
	Path,
	PathValue,
	SubscribeProps,
} from "#/lib/form/use-form"

// biome-ignore lint/suspicious/noExplicitAny: mirrors useForm's own constraint - the values shape belongs to the caller, not to this module.
type AnyObject = Record<string, any>

// Every path whose value is assignable to T. PathValue<Values, P> is not a
// naked type parameter here, so the conditional doesn't distribute - which is
// the point: `string | undefined extends string` stays false, keeping an
// optional field like gameId out of StringPath, where a controlled input would
// otherwise be handed `undefined`.
type PathOfType<Values, T> = {
	[P in Path<Values>]: PathValue<Values, P> extends T ? P : never
}[Path<Values>]

/**
 * A typed form context plus the field components bound to it.
 *
 * The problem this solves: a form big enough to split into panels has to hand
 * each panel the form handle, and every child then re-declares
 * `form: SomeFormApi` and every call site re-passes `form={form}`. Calling this
 * once per form gives the whole subtree the handle off context instead.
 *
 * The generic is fixed at the call site, so consumers never re-apply it:
 *
 *   export const { FormProvider, Field, useWatch, TextField } =
 *       createFormContext<typeof createQuestionSchema>()
 *
 * Nothing in #/components/ui knows this module exists. The field components
 * below read the form off context and hand those primitives plain
 * value/onChange/error props, exactly as a hand-written render prop would.
 */
export function createFormContext<Schema extends z.ZodType<AnyObject>>() {
	type Values = z.output<Schema>
	type Api = FormApi<Values>

	// Typed as FormApi<Values> rather than ReturnType<typeof useForm<Schema>>
	// on purpose. Unifying a deferred ReturnType against a separately-computed
	// FieldProps<z.output<Schema>, P> is exactly the comparison TypeScript
	// gives up on; naming the value shape directly keeps it syntactic.
	const Ctx = React.createContext<Api | null>(null)

	function useFormContext(part = "useFormContext"): Api {
		const ctx = React.useContext(Ctx)
		if (!ctx) {
			throw new Error(`Form.${part} must be rendered inside <FormProvider>`)
		}
		return ctx
	}

	// The value is whatever useForm returned, which is built once inside its own
	// useState and never changes identity - so this provider never re-renders a
	// consumer on its own account.
	function FormProvider(props: { form: Api; children: React.ReactNode }) {
		return <Ctx.Provider value={props.form}>{props.children}</Ctx.Provider>
	}

	// Each of these renders the underlying primitive as JSX rather than calling
	// it - the primitives call useStore internally, and invoking one as a plain
	// function would attribute its hooks to this wrapper instead of giving it
	// its own fiber.
	function Field<P extends Path<Values>>(props: FieldProps<Values, P>) {
		const { Field: Inner } = useFormContext("Field")
		return <Inner {...props} />
	}

	function FieldArray<P extends ArrayPath<Values>>(
		props: FieldArrayProps<Values, P>,
	) {
		const { FieldArray: Inner } = useFormContext("FieldArray")
		return <Inner {...props} />
	}

	function Subscribe<T>(props: SubscribeProps<Values, T>) {
		const { Subscribe: Inner } = useFormContext("Subscribe")
		return <Inner {...props} />
	}

	function useWatch<P extends Path<Values>>(name: P): PathValue<Values, P> {
		return useFormContext("useWatch").useWatch(name)
	}

	function useSetValue() {
		return useFormContext("useSetValue").setValue
	}

	function useFormValues() {
		return useFormContext("useFormValues").values
	}

	/** ==================================================================================
	 * Field kit
	 *
	 * Each component narrows `name` to the paths whose value it can actually
	 * render, then casts that value to the concrete primitive. The casts are
	 * unavoidable: TypeScript does not carry `P extends PathOfType<Values,
	 * string>` forward into a fact about `PathValue<Values, P>`. They're sound
	 * by construction and none of them is `any` - don't try to "fix" them by
	 * widening the constraints, which would only move the unsoundness to the
	 * call sites.
	 * ================================================================================= */

	type StringPath = PathOfType<Values, string>
	type NumberPath = PathOfType<Values, number | undefined>
	type StringListPath = PathOfType<Values, string[]>
	type NumberListPath = PathOfType<Values, number[]>
	type BooleanPath = PathOfType<Values, boolean>

	function TextField<P extends StringPath & Path<Values>>(props: {
		name: P
		label: string
		required?: boolean
		placeholder?: string
		description?: string
		// Fires after the field's own onChange, for the rare field that drives a
		// side effect (backfilling a sibling field, flagging that the creator has
		// taken the field over). A field whose side effect has to run *before*
		// the value lands wants the raw Field render prop instead.
		onValueChange?: (next: string) => void
	}) {
		return (
			<Field name={props.name}>
				{(field) => (
					<TextInput
						error={field.meta.error ?? undefined}
						description={props.description}
					>
						<TextInput.Label required={props.required}>
							{props.label}
						</TextInput.Label>
						<TextInput.Group>
							<TextInput.Field
								placeholder={props.placeholder}
								aria-required={props.required}
								value={field.value as string}
								onChange={(e) => {
									field.onChange(e)
									props.onValueChange?.(e.target.value)
								}}
								onBlur={field.onBlur}
							/>
						</TextInput.Group>
					</TextInput>
				)}
			</Field>
		)
	}

	function NumberField<P extends NumberPath & Path<Values>>(props: {
		name: P
		label: string
		required?: boolean
		placeholder?: string
		description?: string
		min?: number
		max?: number
		// "any" rather than a fixed step for a field whose precision varies with
		// what's being measured - see the over/under line, where a rate stat needs
		// finer decimals than a counting stat.
		step?: string | number
	}) {
		return (
			<Field name={props.name}>
				{(field) => (
					<TextInput
						error={field.meta.error ?? undefined}
						description={props.description}
					>
						<TextInput.Label required={props.required}>
							{props.label}
						</TextInput.Label>
						<TextInput.Group>
							<TextInput.Field
								type="number"
								step={props.step}
								min={props.min}
								max={props.max}
								placeholder={props.placeholder}
								aria-required={props.required}
								value={(field.value as number | undefined) ?? ""}
								// An emptied number input is undefined, not 0 - a required
								// numeric field left blank has to fail validation rather than
								// silently submit a real zero.
								onChange={(e) =>
									field.onChange(
										(e.target.value === ""
											? undefined
											: Number(e.target.value)) as PathValue<Values, P>,
									)
								}
								onBlur={field.onBlur}
							/>
						</TextInput.Group>
					</TextInput>
				)}
			</Field>
		)
	}

	// Lists the picks by name up to a point, then falls back to a count once
	// that'd make the trigger unreadably wide (a full position list, a
	// many-division race).
	function multiSelectSummary(values: string[], emptyLabel: string): string {
		if (values.length === 0) return emptyLabel
		if (values.length <= 3) return values.join(", ")
		return `${values.length} selected`
	}

	function MultiSelectPanel(props: {
		label: string
		emptyLabel: string
		hint?: React.ReactNode
		error: string | null
		options: readonly { value: string; label: string }[]
		value: string[]
		onValueChange: (next: string[]) => void
	}) {
		return (
			<VStack gap="1.5" alignItems="stretch">
				<FieldLabel>{props.label}</FieldLabel>
				<MultiSelect
					value={props.value}
					onValueChange={props.onValueChange}
					error={props.error ?? undefined}
				>
					<MultiSelect.Trigger>
						{multiSelectSummary(props.value, props.emptyLabel)}
					</MultiSelect.Trigger>
					<MultiSelect.Content>
						{props.options.map((option) => (
							<MultiSelect.Option key={option.value} value={option.value}>
								{option.label}
							</MultiSelect.Option>
						))}
					</MultiSelect.Content>
				</MultiSelect>
				{props.hint && <FieldHint>{props.hint}</FieldHint>}
			</VStack>
		)
	}

	function MultiSelectField<P extends StringListPath & Path<Values>>(props: {
		name: P
		label: string
		emptyLabel: string
		hint?: React.ReactNode
		options: readonly { value: string; label: string }[]
		// Fires after the value lands, same contract as TextField's.
		onValueChange?: (next: string[]) => void
	}) {
		return (
			<Field name={props.name}>
				{(field) => (
					<MultiSelectPanel
						label={props.label}
						emptyLabel={props.emptyLabel}
						hint={props.hint}
						error={field.meta.error}
						options={props.options}
						value={field.value as string[]}
						onValueChange={(next) => {
							field.onChange(next as PathValue<Values, P>)
							props.onValueChange?.(next)
						}}
					/>
				)}
			</Field>
		)
	}

	// MultiSelect is generic over `T extends string`, so a numeric list has to
	// round-trip through strings at this boundary rather than pushing the
	// conversion out to every call site.
	function NumberMultiSelectField<
		P extends NumberListPath & Path<Values>,
	>(props: {
		name: P
		label: string
		emptyLabel: string
		hint?: React.ReactNode
		options: readonly { value: number; label: string }[]
	}) {
		return (
			<Field name={props.name}>
				{(field) => (
					<MultiSelectPanel
						label={props.label}
						emptyLabel={props.emptyLabel}
						hint={props.hint}
						error={field.meta.error}
						options={props.options.map((option) => ({
							value: String(option.value),
							label: option.label,
						}))}
						value={(field.value as number[]).map(String)}
						onValueChange={(next) =>
							field.onChange(next.map(Number) as PathValue<Values, P>)
						}
					/>
				)}
			</Field>
		)
	}

	// No path constraint - deriving the option value type from the field's own
	// value type means a typo'd option is a type error against that specific
	// field's union, which is stricter than anything a constraint here could say.
	function ChipField<P extends Path<Values>>(props: {
		name: P
		label: string
		required?: boolean
		hint?: React.ReactNode
		options: readonly (readonly [
			value: NonNullable<PathValue<Values, P>>,
			label: string,
		])[]
		// Fires after a different chip's value lands. Re-picking the chip
		// already selected changes nothing, so it doesn't fire.
		onValueChange?: (next: NonNullable<PathValue<Values, P>>) => void
	}) {
		return (
			<Field name={props.name}>
				{(field) => (
					<VStack gap="1.5" alignItems="stretch">
						<FieldLabel required={props.required}>{props.label}</FieldLabel>
						<HStack gap="1.5">
							{props.options.map(([value, label]) => (
								<ChipButton
									key={String(value)}
									selected={field.value === value}
									pressed={field.value === value}
									onClick={() => {
										const changed = field.value !== value
										field.onChange(value)
										if (changed) props.onValueChange?.(value)
									}}
								>
									{label}
								</ChipButton>
							))}
						</HStack>
						{props.hint && <FieldHint>{props.hint}</FieldHint>}
						{field.meta.error && (
							<span className={css({ fontSize: "xs", color: "fg.error" })}>
								{field.meta.error}
							</span>
						)}
					</VStack>
				)}
			</Field>
		)
	}

	function ToggleField<P extends BooleanPath & Path<Values>>(props: {
		name: P
		label: string
		description?: React.ReactNode
		// Fires after the value lands, same contract as TextField's.
		onValueChange?: (next: boolean) => void
	}) {
		return (
			<Field name={props.name}>
				{(field) => (
					<ToggleRow
						label={props.label}
						description={props.description}
						checked={field.value as boolean}
						onChange={(next) => {
							field.onChange(next as PathValue<Values, P>)
							props.onValueChange?.(next)
						}}
					/>
				)}
			</Field>
		)
	}

	return {
		FormProvider,
		useFormContext,
		Field,
		FieldArray,
		Subscribe,
		useWatch,
		useSetValue,
		useFormValues,
		TextField,
		NumberField,
		MultiSelectField,
		NumberMultiSelectField,
		ChipField,
		ToggleField,
	}
}
