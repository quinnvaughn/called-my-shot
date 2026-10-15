import { createQuestionSchema } from "@called-my-shot/schemas"
import type { EntitySearchItem } from "./entity-search-field"
import type { CreateQuestionValues } from "./form-context"

/**
 * The submitted values that follow from the rest of the form rather than
 * being typed in: the title, which is the generated preview until the creator
 * edits it, and a pool shape's options, which are always its whole pool.
 *
 * These stay out of form state until submit, so the form's own validation
 * judges stored values that differ from what will actually be sent.
 */
export type DerivedValues = Pick<CreateQuestionValues, "title"> &
	Partial<Pick<CreateQuestionValues, "options">>

export function toPoolOptions(
	items: EntitySearchItem[],
): CreateQuestionValues["options"] {
	return items.map((item) => ({
		label: item.label,
		teamId: item.kind === "team" ? item.id : undefined,
		playerId: item.kind === "player" ? item.id : undefined,
	}))
}

function isDerivedPath(derived: DerivedValues, path: string): boolean {
	return Object.keys(derived).some(
		(key) => path === key || path.startsWith(`${key}.`),
	)
}

/**
 * Whether the form can submit once the derived values are written in. An
 * error standing on any other path still blocks, a server-side one included;
 * on a derived path only the schema's verdict on the derived value counts.
 */
export function canSubmitWith(
	state: {
		values: CreateQuestionValues
		errors: Record<string, string | null>
	},
	derived: DerivedValues,
): boolean {
	const blocked = Object.entries(state.errors).some(
		([path, error]) => error != null && !isDerivedPath(derived, path),
	)
	if (blocked) return false
	const parsed = createQuestionSchema.safeParse({
		...state.values,
		...derived,
	})
	return (
		parsed.success ||
		parsed.error.issues.every(
			(issue) => !isDerivedPath(derived, issue.path.join(".")),
		)
	)
}
