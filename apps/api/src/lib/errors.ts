export type FieldErrorShape = { field: string | null; message: string }

export class ValidationError extends Error {
	fieldErrors: FieldErrorShape[]

	constructor(fieldErrors: FieldErrorShape[]) {
		super(fieldErrors[0]?.message ?? "Validation failed")
		this.name = "ValidationError"
		this.fieldErrors = fieldErrors
	}

	static field(field: string | null, message: string) {
		return new ValidationError([{ field, message }])
	}

	static fromZodIssues(issues: { path: PropertyKey[]; message: string }[]) {
		return new ValidationError(
			issues.map((issue) => ({
				field: issue.path.length ? issue.path.join(".") : null,
				message: issue.message,
			})),
		)
	}
}

export class AuthenticationError extends Error {
	constructor(message = "You must be signed in.") {
		super(message)
		this.name = "AuthenticationError"
	}
}

export class AuthorizationError extends Error {
	constructor(message = "You don't have permission to do that.") {
		super(message)
		this.name = "AuthorizationError"
	}
}

export class NotFoundError extends Error {
	constructor(message = "Not found.") {
		super(message)
		this.name = "NotFoundError"
	}
}
