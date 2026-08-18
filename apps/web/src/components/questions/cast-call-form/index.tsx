import { MultiSelectFields } from "./multi-select-fields"
import { NumericGuessFields } from "./numeric-guess-fields"
import { OptionFields } from "./option-fields"
import {
	CastCallFormFragment,
	FORM_ID,
	useCastCallForm,
} from "./use-cast-call-form"

export { CastCallFormFragment, FORM_ID, useCastCallForm }
export type { CastCallFormState } from "./use-cast-call-form"

type Props = {
	callForm: ReturnType<typeof useCastCallForm>
}

// Just the fields. The review/submit action lives in <CallSubmitBar>,
// rendered separately by the route at the top level of the page (see
// use-cast-call-form.ts for why). Which fields render is purely a function
// of the question's type - each type's own file (option-fields/
// multi-select-fields/numeric-guess-fields) owns its whole layout, case field
// included, rather than splicing a shared trailing field into someone else's
// spacing here.
export function CastCallForm({ callForm }: Props) {
	const { question, type } = callForm

	if (!question) return null

	return (
		<form id={FORM_ID} onSubmit={callForm.form.handleSubmit}>
			{(type === "multiple_choice" ||
				type === "yes_no" ||
				type === "over_under") && <OptionFields callForm={callForm} />}
			{type === "multi_select" && <MultiSelectFields callForm={callForm} />}
			{type === "numeric_guess" && <NumericGuessFields callForm={callForm} />}
		</form>
	)
}
