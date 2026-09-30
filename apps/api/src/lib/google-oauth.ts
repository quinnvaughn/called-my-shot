import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import { env } from "../env"

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"])

export function googleConfigured(): boolean {
	return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

// On the web app's origin, not the api's: the browser never talks to the api
// directly, and the callback has to set the session cookie first-party. The
// web app proxies this path through to routes/auth-google.ts.
export function googleRedirectUri(): string {
	return `${env.CLIENT_ORIGIN.replace(/\/$/, "")}/auth/google/callback`
}

const base64url = (buf: Buffer) => buf.toString("base64url")

export function randomToken(): string {
	return base64url(randomBytes(32))
}

export function googleAuthorizeUrl(state: string, codeVerifier: string) {
	const challenge = base64url(createHash("sha256").update(codeVerifier).digest())
	const url = new URL(AUTHORIZE_URL)
	url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID ?? "")
	url.searchParams.set("redirect_uri", googleRedirectUri())
	url.searchParams.set("response_type", "code")
	url.searchParams.set("scope", "openid email profile")
	url.searchParams.set("state", state)
	url.searchParams.set("code_challenge", challenge)
	url.searchParams.set("code_challenge_method", "S256")
	// Lets someone with several Google accounts pick which one, instead of
	// being signed in silently as whichever is the browser's default.
	url.searchParams.set("prompt", "select_account")
	return url.toString()
}

const idTokenClaims = z.object({
	iss: z.string(),
	aud: z.string(),
	exp: z.number(),
	sub: z.string().min(1),
	email: z.email(),
	email_verified: z.boolean().optional(),
	name: z.string().optional(),
})

export type GoogleIdentity = {
	sub: string
	email: string
	emailVerified: boolean
	name: string | null
}

// Trades the authorization code for the user's identity.
//
// The id token's signature isn't checked against Google's keys. It came
// straight back from Google's token endpoint over TLS, authenticated with
// the client secret, which OpenID Connect Core 3.1.3.7 allows as a substitute
// for signature validation. Issuer, audience and expiry are still checked.
export async function exchangeGoogleCode(
	code: string,
	codeVerifier: string,
): Promise<GoogleIdentity> {
	const res = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			code_verifier: codeVerifier,
			client_id: env.GOOGLE_CLIENT_ID ?? "",
			client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
			redirect_uri: googleRedirectUri(),
			grant_type: "authorization_code",
		}),
	})
	if (!res.ok) {
		throw new Error(`Google token exchange failed: ${res.status}`)
	}

	const body = z.object({ id_token: z.string() }).parse(await res.json())
	const payload = body.id_token.split(".")[1]
	if (!payload) throw new Error("Malformed Google id token")
	const claims = idTokenClaims.parse(
		JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
	)

	if (!ISSUERS.has(claims.iss)) throw new Error("Unexpected id token issuer")
	if (claims.aud !== env.GOOGLE_CLIENT_ID) {
		throw new Error("Id token was issued to a different client")
	}
	if (claims.exp * 1000 < Date.now()) throw new Error("Id token has expired")

	return {
		sub: claims.sub,
		email: claims.email.toLowerCase(),
		emailVerified: claims.email_verified === true,
		name: claims.name?.trim() || null,
	}
}
