import { MultiSelectFields } from "./multi-select-fields"
import { NumericGuessFields } from "./numeric-guess-fields"
import { OptionFields } from "./option-fields"
import {
	CastCallFormFragment,
	FORM_ID,
	useCastCallForm,
} from "./use-cast-call-form"

export { CastCallFormFragment, FORM_ID, useCastCallForm }
export type {
	CallDraft,
	CastCallFormState,
} from "./use-cast-call-form"

type Props = {
	callForm: ReturnType<typeof useCastCallForm>
}

// Just the fields. The review/submit action lives in <CallSubmitBar>,
// rendered separately by the route at the top level of the page (see
// use-cast-call-form.ts for why). Which fields render is purely a function of
// the question's cast-call bucket (single pick / several picks / numeric
// guess), not its specific shape - each bucket's own file (option-fields/
// multi-select-fields/numeric-guess-fields) owns its whole layout, case field
// included, rather than splicing a shared trailing field into someone else's
// spacing here.
export function CastCallForm({ callForm }: Props) {
	const { question, bucket } = callForm

	if (!question) return null

	return (
		<form id={callForm.formId} onSubmit={callForm.form.handleSubmit}>
			{bucket === "single" && <OptionFields callForm={callForm} />}
			{bucket === "multi" && <MultiSelectFields callForm={callForm} />}
			{bucket === "numeric" && <NumericGuessFields callForm={callForm} />}
		</form>
	)
}
