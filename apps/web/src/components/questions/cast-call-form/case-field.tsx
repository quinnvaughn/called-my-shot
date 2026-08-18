import { Textarea } from "#/components/ui/textarea"
import type { CastCallFormState } from "./use-cast-call-form"

type Props = {
	callForm: CastCallFormState
}

// Shared by every question type - the one field that isn't part of the
// call itself.
export function CaseField({ callForm }: Props) {
	const { form, caseTextRef } = callForm

	return (
		<form.Field name="caseText">
			{(field) => (
				<Textarea error={field.meta.error ?? undefined}>
					<Textarea.Label>Make your case (optional)</Textarea.Label>
					<Textarea.Field
						ref={caseTextRef}
						placeholder="Why this call?"
						maxLength={600}
						value={field.value}
						onChange={field.onChange}
						onBlur={field.onBlur}
					/>
					<Textarea.CharCount value={field.value} max={600} />
				</Textarea>
			)}
		</form.Field>
	)
}
