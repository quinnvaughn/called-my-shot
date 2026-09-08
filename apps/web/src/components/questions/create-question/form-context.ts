import type { createQuestionSchema } from "@called-my-shot/schemas"
import type { z } from "zod"
import { createFormContext } from "#/components/form/create-form-context"

export type CreateQuestionValues = z.output<typeof createQuestionSchema>

// One instantiation for the whole create-question tree. Every panel and field
// below imports its primitives from here rather than taking a `form` prop, so
// adding a field to a panel doesn't mean threading a handle down to it.
export const {
	FormProvider,
	useFormContext,
	Field,
	FieldArray,
	Subscribe,
	useWatch,
	useSetValue,
	TextField,
	NumberField,
	MultiSelectField,
	NumberMultiSelectField,
	ChipField,
	ToggleField,
} = createFormContext<typeof createQuestionSchema>()
