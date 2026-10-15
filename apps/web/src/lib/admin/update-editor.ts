export type EditableUpdate = {
	id: string
	slug: string | null
	title: string
	summary: string
	body: string
	coverImageKey: string | null
	coverImageUrl: string | null
	publishedAt: string | null
	emailedAt: string | null
	emailProgress: { sent: number; skipped: number; pending: number } | null
}

export type Draft = {
	title: string
	summary: string
	body: string
	coverImageKey: string | null
	coverImageUrl: string | null
}

export type FieldErrors = Partial<Record<"title" | "summary" | "body", string>>

// Every mutation here answers with a union whose failure members carry either
// field errors or a message.
type Failure =
	| {
			__typename: "ValidationError"
			fieldErrors: { field: string | null; message: string }[]
	  }
	| {
			__typename: "NotFoundError" | "AuthenticationError" | "AuthorizationError"
			message: string
	  }

export function failureMessage(failure: Failure): string {
	return failure.__typename === "ValidationError"
		? (failure.fieldErrors[0]?.message ?? "That didn't work.")
		: failure.message
}

export function fieldErrorsOf(failure: Failure): FieldErrors {
	if (failure.__typename !== "ValidationError") return {}
	const errors: FieldErrors = {}
	for (const { field, message } of failure.fieldErrors) {
		if (field === "title" || field === "summary" || field === "body") {
			errors[field] = message
		}
	}
	return errors
}

export function draftOf(update: EditableUpdate | null): Draft {
	return {
		title: update?.title ?? "",
		summary: update?.summary ?? "",
		body: update?.body ?? "",
		coverImageKey: update?.coverImageKey ?? null,
		coverImageUrl: update?.coverImageUrl ?? null,
	}
}
