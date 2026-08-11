import { signInSchema, signUpSchema } from "@called-my-shot/schemas"
import { db } from "../../db"
import { users } from "../../db/schema"
import { ValidationError } from "../../lib/errors"
import { hashPassword, verifyPassword } from "../../lib/password"
import {
	clearSessionCookie,
	createSession,
	deleteSession,
	setSessionCookie,
} from "../../lib/session"
import { builder } from "../builder"
import { UserRef } from "./user"

type AuthPayloadShape = { user: typeof users.$inferSelect }

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
			type: AuthPayload,
			errors: { directResult: true, union: { name: "SignUpResult" } },
			args: { input: t.arg({ type: SignUpInput, required: true }) },
			resolve: async (_root, args, ctx): Promise<AuthPayloadShape> => {
				const parsed = signUpSchema.safeParse(args.input)
				if (!parsed.success) {
					throw ValidationError.fromZodIssues(parsed.error.issues)
				}
				const { name, username, email, password } = parsed.data

				const existing = await db.query.users.findFirst({
					where: { OR: [{ email }, { username }] },
				})
				if (existing) {
					throw existing.email === email
						? ValidationError.field("email", "Email is already in use")
						: ValidationError.field("username", "Username is already taken")
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
			type: AuthPayload,
			errors: { directResult: true, union: { name: "SignInResult" } },
			args: { input: t.arg({ type: SignInInput, required: true }) },
			resolve: async (_root, args, ctx): Promise<AuthPayloadShape> => {
				const parsed = signInSchema.safeParse(args.input)
				if (!parsed.success) {
					throw ValidationError.fromZodIssues(parsed.error.issues)
				}
				const { identifier, password } = parsed.data

				const user = await db.query.users.findFirst({
					where: { OR: [{ email: identifier }, { username: identifier }] },
				})
				if (!user || !(await verifyPassword(user.passwordHash, password))) {
					throw ValidationError.field(
						null,
						"Invalid email/username or password",
					)
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
