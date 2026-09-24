import { signInSchema, signUpSchema } from "@called-my-shot/schemas"
import { db } from "../../db"
import { type User, users } from "../../db/schema"
import { issuePendingEmailChange } from "../../lib/email-change"
import { ValidationError } from "../../lib/errors"
import { hashPassword, verifyPassword } from "../../lib/password"
import { grantWelcomeRedo } from "../../lib/redos"
import { recordReferralAtSignup } from "../../lib/referrals"
import { clientIpOf } from "../../lib/request-ip"
import {
	clearSessionCookie,
	createSession,
	deleteSession,
	setSessionCookie,
} from "../../lib/session"
import { builder } from "../builder"
import { parseInput } from "../helpers"
import { UserRef } from "./user"

type AuthPayloadShape = { user: User; redoGranted?: boolean }

const AuthPayload = builder
	.objectRef<AuthPayloadShape>("AuthPayload")
	.implement({
		fields: (t) => ({
			user: t.field({
				type: UserRef,
				resolve: (payload) => payload.user,
			}),
			// Whether this signup came through a working invite and so landed
			// with a redo already in the wallet. Reported by the server rather
			// than inferred from "they typed a code", because an unknown or
			// mistyped code is accepted silently and grants nothing - the
			// client has no way to tell those apart on its own, and a welcome
			// toast for a redo that doesn't exist is worse than no toast.
			// False on sign-in, which never grants anything.
			redoGranted: t.boolean({
				resolve: (payload) => payload.redoGranted ?? false,
			}),
		}),
	})

const ReferralSourceEnum = builder.enumType("ReferralSource", {
	values: ["INVITE_LINK", "MANUAL_CODE"] as const,
})

const SignUpInput = builder.inputType("SignUpInput", {
	fields: (t) => ({
		name: t.string({ required: true }),
		username: t.string({ required: true }),
		email: t.string({ required: true }),
		password: t.string({ required: true }),
		// Set by /join/:code, or typed into the form's "have a code?" field.
		referralCode: t.string({ required: false }),
		// Which of those two it was. Only meaningful alongside referralCode.
		referralSource: t.field({ type: ReferralSourceEnum, required: false }),
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
				const { name, username, email, password, referralCode } = parseInput(
					signUpSchema,
					args.input,
				)

				const existing = await db.query.users.findFirst({
					where: { OR: [{ email }, { username }] },
				})
				if (existing) {
					throw existing.email === email
						? ValidationError.field("email", "Email is already in use")
						: ValidationError.field("username", "Username is already taken")
				}

				const passwordHash = await hashPassword(password)

				// The account, its attribution, and the invitee's own welcome
				// redo go in together: an account created with its referral
				// row missing would silently owe two people a redo that no
				// later step ever grants.
				const { user, redoGranted } = await db.transaction(async (tx) => {
					const [created] = await tx
						.insert(users)
						.values({ name, username, email, passwordHash })
						.returning()

					if (!referralCode) return { user: created, redoGranted: false }

					const referral = await recordReferralAtSignup(
						tx,
						created,
						referralCode,
						args.input.referralSource === "MANUAL_CODE"
							? "manual_code"
							: "invite_link",
						clientIpOf(ctx.req),
					)
					// Both sides of an invite get a redo. The invitee's lands
					// now rather than on their first call, because it is the
					// reason they used the link at all. A code that matched
					// nothing leaves referral null and grants nothing.
					if (!referral) return { user: created, redoGranted: false }

					await grantWelcomeRedo(tx, created.id, referral.id)
					return { user: created, redoGranted: true }
				})

				// Session creation stays outside the transaction so a cookie is
				// never set for a user the transaction went on to roll back.
				const session = await createSession(user.id)
				setSessionCookie(ctx.res, session)
				ctx.ownedUserIds.add(user.id)

				// An email outage shouldn't fail signup - the account is already
				// created, this just kicks off the verification email.
				void issuePendingEmailChange(user.id, user.email, user.email, "/")

				return { user, redoGranted }
			},
		}),

		signIn: t.field({
			type: AuthPayload,
			errors: { directResult: true, union: { name: "SignInResult" } },
			args: { input: t.arg({ type: SignInInput, required: true }) },
			resolve: async (_root, args, ctx): Promise<AuthPayloadShape> => {
				const { identifier, password } = parseInput(signInSchema, args.input)

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
				ctx.ownedUserIds.add(user.id)

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
