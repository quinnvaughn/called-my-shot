import { eq, sql } from "drizzle-orm"
import cookieParser from "cookie-parser"
import type { Express, Request, Response } from "express"
import { z } from "zod"
import { db } from "../db"
import { oauthAccounts, sessions, type User, users } from "../db/schema"
import { env } from "../env"
import {
	createAccountWithGeneratedUsername,
	type SignupReferral,
	usernameBaseFromEmail,
} from "../lib/accounts"
import {
	exchangeGoogleCode,
	type GoogleIdentity,
	googleAuthorizeUrl,
	googleConfigured,
	randomToken,
} from "../lib/google-oauth"
import { clientIpOf } from "../lib/request-ip"
import { createSession, setSessionCookie } from "../lib/session"

// Holds everything the callback needs that Google doesn't hand back: the CSRF
// state, the PKCE verifier, and what the signup should carry once it lands.
// The invite code rides here because the client reads it from localStorage
// before leaving, and nothing on the far side of Google can reach that.
const FLOW_COOKIE = "google_oauth"
const FLOW_TTL_MS = 10 * 60 * 1000

// Lax, not strict: the callback is a top-level navigation arriving from
// accounts.google.com, which a strict cookie wouldn't be sent on.
const flowCookieOptions = {
	httpOnly: true,
	sameSite: "lax" as const,
	secure: env.NODE_ENV === "production",
	path: "/auth/google",
}

const flowSchema = z.object({
	state: z.string(),
	verifier: z.string(),
	returnTo: z.string(),
	referral: z
		.object({
			code: z.string(),
			source: z.enum(["invite_link", "manual_code"]),
		})
		.nullable(),
})
export type Flow = z.infer<typeof flowSchema>

// Only a same-site path. Anything else would make this an open redirect.
function safeReturnTo(raw: unknown): string {
	if (typeof raw !== "string") return "/home"
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
		return "/home"
	}
	return raw
}

function withParams(path: string, params: Record<string, string>): string {
	const url = new URL(path, "http://placeholder")
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value)
	}
	return `${url.pathname}${url.search}${url.hash}`
}

function readReferral(req: Request): SignupReferral | null {
	const code = req.query.ref
	if (typeof code !== "string" || code.trim() === "") return null
	return {
		code: code.trim().toUpperCase(),
		source: req.query.src === "manual_code" ? "manual_code" : "invite_link",
	}
}

function readFlow(req: Request): Flow | null {
	const raw = req.cookies?.[FLOW_COOKIE]
	if (typeof raw !== "string") return null
	try {
		return flowSchema.parse(JSON.parse(raw))
	} catch {
		return null
	}
}

async function findUserByEmail(email: string): Promise<User | null> {
	// Case-insensitive because email signup has never lowercased what people
	// typed, and "John@Gmail.com" is the same inbox Google reports as
	// "john@gmail.com".
	const [row] = await db
		.select()
		.from(users)
		.where(sql`lower(${users.email}) = ${email}`)
		.limit(1)
	return row ?? null
}

export type SignInOutcome =
	| { kind: "signin"; user: User }
	| { kind: "signup"; user: User; redoGranted: boolean }

export async function resolveGoogleUser(
	identity: GoogleIdentity,
	flow: Flow,
	signupIp: string | null,
): Promise<SignInOutcome> {
	const linked = await db.query.oauthAccounts.findFirst({
		where: { provider: "google", providerUserId: identity.sub },
		with: { user: true },
	})
	if (linked?.user) return { kind: "signin", user: linked.user }

	const existing = await findUserByEmail(identity.email)
	if (existing) {
		const user = await db.transaction(async (tx) => {
			await tx.insert(oauthAccounts).values({
				userId: existing.id,
				provider: "google",
				providerUserId: identity.sub,
			})
			if (existing.emailVerified) return existing

			// Nobody ever proved they owned this inbox, and Google just did.
			// Whoever made the account may not be that person: someone can
			// sign up with another person's address, set a password, and wait.
			// The inbox owner takes the account over, and the unproven
			// password and every session it opened stop working.
			await tx.delete(sessions).where(eq(sessions.userId, existing.id))
			const [updated] = await tx
				.update(users)
				.set({ emailVerified: true, passwordHash: null })
				.where(eq(users.id, existing.id))
				.returning()
			return updated ?? existing
		})
		return { kind: "signin", user }
	}

	const name = (identity.name ?? identity.email.split("@")[0] ?? "").slice(
		0,
		80,
	)
	const { user, redoGranted } = await db.transaction(async (tx) => {
		const created = await createAccountWithGeneratedUsername(tx, {
			name,
			usernameBase: usernameBaseFromEmail(identity.email, name),
			email: identity.email,
			passwordHash: null,
			emailVerified: true,
			referral: flow.referral,
			signupIp,
		})
		await tx.insert(oauthAccounts).values({
			userId: created.user.id,
			provider: "google",
			providerUserId: identity.sub,
		})
		return created
	})
	return { kind: "signup", user, redoGranted }
}

export function registerGoogleAuthRoutes(app: Express) {
	app.get("/auth/google", (req: Request, res: Response) => {
		const returnTo = safeReturnTo(req.query.returnTo)
		if (!googleConfigured()) {
			res.redirect(withParams(returnTo, { authError: "google" }))
			return
		}

		const flow: Flow = {
			state: randomToken(),
			verifier: randomToken(),
			returnTo,
			referral: readReferral(req),
		}
		res.cookie(FLOW_COOKIE, JSON.stringify(flow), {
			...flowCookieOptions,
			maxAge: FLOW_TTL_MS,
		})
		res.redirect(googleAuthorizeUrl(flow.state, flow.verifier))
	})

	app.get(
		"/auth/google/callback",
		cookieParser(),
		async (req: Request, res: Response) => {
			const flow = readFlow(req)
			res.clearCookie(FLOW_COOKIE, flowCookieOptions)

			const returnTo = flow?.returnTo ?? "/"
			const fail = () =>
				res.redirect(withParams(returnTo, { authError: "google" }))

			// Backing out of Google's account picker isn't an error worth
			// telling anyone about. Put them back where they were.
			if (req.query.error === "access_denied") {
				res.redirect(returnTo)
				return
			}

			const code = req.query.code
			if (
				!flow ||
				typeof code !== "string" ||
				req.query.state !== flow.state
			) {
				fail()
				return
			}

			let outcome: SignInOutcome
			try {
				const identity = await exchangeGoogleCode(code, flow.verifier)
				// An address Google itself hasn't verified proves nothing about
				// who owns it, so it can neither create nor claim an account.
				if (!identity.emailVerified) {
					fail()
					return
				}
				outcome = await resolveGoogleUser(identity, flow, clientIpOf(req))
			} catch (err) {
				console.error("Google sign-in failed", err)
				fail()
				return
			}

			const session = await createSession(outcome.user.id)
			setSessionCookie(res, session)

			res.redirect(
				withParams(
					returnTo,
					outcome.kind === "signup"
						? {
								auth: "google_signup",
								...(outcome.redoGranted ? { redo: "1" } : {}),
							}
						: { auth: "google_signin" },
				),
			)
		},
	)
}
