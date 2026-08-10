import { signInSchema, signUpSchema } from "@called-my-shot/schemas"
import { db } from "../../db"
import { users } from "../../db/schema"
import { hashPassword, verifyPassword } from "../../lib/password"
import {
	clearSessionCookie,
	createSession,
	deleteSession,
	setSessionCookie,
} from "../../lib/session"
import { builder } from "../builder"
import { UserRef } from "./user"

type FieldErrorShape = { field: string | null; message: string }
type AuthErrorShape = { fieldErrors: FieldErrorShape[] }
type AuthPayloadShape = { user: typeof users.$inferSelect }
type AuthResult = AuthPayloadShape | AuthErrorShape

function fieldError(field: string | null, message: string): AuthErrorShape {
	return { fieldErrors: [{ field, message }] }
}

function fieldErrorsFromIssues(
	issues: { path: PropertyKey[]; message: string }[],
): AuthErrorShape {
	return {
		fieldErrors: issues.map((issue) => ({
			field: issue.path.length ? issue.path.join(".") : null,
			message: issue.message,
		})),
	}
}

const FieldError = builder.objectRef<FieldErrorShape>("FieldError").implement({
	fields: (t) => ({
		field: t.exposeString("field", { nullable: true }),
		message: t.exposeString("message"),
	}),
})

const AuthError = builder.objectRef<AuthErrorShape>("AuthError").implement({
	fields: (t) => ({
		fieldErrors: t.field({
			type: [FieldError],
			resolve: (error) => error.fieldErrors,
		}),
	}),
})

const AuthPayload = builder
	.objectRef<AuthPayloadShape>("AuthPayload")
	.implement({
		fields: (t) => ({
			user: t.field({
				type: UserRef,
				resolve: (payload) => payload.user,
			}),
		}),
	})

function authResult(name: string) {
	return builder.unionType(name, {
		types: [AuthPayload, AuthError],
		resolveType: (result: AuthResult) =>
			"user" in result ? AuthPayload : AuthError,
	})
}

const SignUpResult = authResult("SignUpResult")
const SignInResult = authResult("SignInResult")

const SignUpInput = builder.inputType("SignUpInput", {
	fields: (t) => ({
		name: t.string({ required: true }),
		username: t.string({ required: true }),
		email: t.string({ required: true }),
		password: t.string({ required: true }),
	}),
})

const SignInInput = builder.inputType("SignInInput", {
	fields: (t) => ({
		identifier: t.string({ required: true }),
		password: t.string({ required: true }),
	}),
})

builder.mutationType({
	fields: (t) => ({
		signUp: t.field({
			type: SignUpResult,
			args: { input: t.arg({ type: SignUpInput, required: true }) },
			resolve: async (_root, args, ctx): Promise<AuthResult> => {
				const parsed = signUpSchema.safeParse(args.input)
				if (!parsed.success) return fieldErrorsFromIssues(parsed.error.issues)
				const { name, username, email, password } = parsed.data

				const existing = await db.query.users.findFirst({
					where: { OR: [{ email }, { username }] },
				})
				if (existing) {
					return existing.email === email
						? fieldError("email", "Email is already in use")
						: fieldError("username", "Username is already taken")
				}

				const passwordHash = await hashPassword(password)
				const [user] = await db
					.insert(users)
					.values({ name, username, email, passwordHash })
					.returning()

				const session = await createSession(user.id)
				setSessionCookie(ctx.res, session)

				return { user }
			},
		}),

		signIn: t.field({
			type: SignInResult,
			args: { input: t.arg({ type: SignInInput, required: true }) },
			resolve: async (_root, args, ctx): Promise<AuthResult> => {
				const parsed = signInSchema.safeParse(args.input)
				if (!parsed.success) return fieldErrorsFromIssues(parsed.error.issues)
				const { identifier, password } = parsed.data

				const user = await db.query.users.findFirst({
					where: { OR: [{ email: identifier }, { username: identifier }] },
				})
				if (!user || !(await verifyPassword(user.passwordHash, password))) {
					return fieldError(null, "Invalid email/username or password")
				}

				const session = await createSession(user.id)
				setSessionCookie(ctx.res, session)

				return { user }
			},
		}),

		signOut: t.boolean({
			resolve: async (_root, _args, ctx) => {
				if (ctx.sessionId) {
					await deleteSession(ctx.sessionId)
					clearSessionCookie(ctx.res)
				}
				return true
			},
		}),
	}),
})
