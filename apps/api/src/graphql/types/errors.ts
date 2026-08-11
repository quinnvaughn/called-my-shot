import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../lib/errors"
import { builder } from "../builder"

export const FieldError = builder
	.objectRef<{ field: string | null; message: string }>("FieldError")
	.implement({
		fields: (t) => ({
			field: t.exposeString("field", { nullable: true }),
			message: t.exposeString("message"),
		}),
	})

export const ErrorInterface = builder.interfaceRef<Error>("Error").implement({
	fields: (t) => ({
		message: t.exposeString("message"),
	}),
})

builder.objectType(AuthenticationError, {
	name: "AuthenticationError",
	interfaces: [ErrorInterface],
})

builder.objectType(AuthorizationError, {
	name: "AuthorizationError",
	interfaces: [ErrorInterface],
})

builder.objectType(NotFoundError, {
	name: "NotFoundError",
	interfaces: [ErrorInterface],
})

builder.objectType(ValidationError, {
	name: "ValidationError",
	interfaces: [ErrorInterface],
	fields: (t) => ({
		fieldErrors: t.field({
			type: [FieldError],
			resolve: (err) => err.fieldErrors,
		}),
	}),
})
