import type { createQuestionSchema } from "@called-my-shot/schemas"
import type { useForm } from "#/lib/form/use-form"

// Shared handle type so the panel subcomponents below can each take the
// same `form` prop from useForm(createQuestionSchema) without re-deriving
// their own generic instantiation.
export type CreateQuestionFormApi = ReturnType<
	typeof useForm<typeof createQuestionSchema>
>
