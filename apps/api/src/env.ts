import { z } from "zod"

const envSchema = z.object({
	DATABASE_URL: z.url(),
	PORT: z.coerce.number().default(4000),
	CLIENT_ORIGIN: z.url().default("http://localhost:3000"),
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	ALLOW_PROD_SEED: z.coerce.boolean().default(false),
	// Where fileSupportTicket delivers to - a recipient, not a sender, so it
	// needs a mailbox that can receive rather than a Resend-verified domain.
	SUPPORT_EMAIL: z.string().default("support@calledmyshot.com"),
	RESEND_API_KEY: z.string().optional(),
	EMAIL_FROM: z
		.string()
		.default("Called My Shot <noreply@mail.calledmyshot.com>"),
	// Defaults to the same verified domain as EMAIL_FROM, just a different
	// From address, because mail.calledmyshot.com is the only domain verified
	// in Resend - a default pointing at an unverified subdomain would fail
	// every send.
	//
	// Worth splitting onto its own subdomain later: digests are the only mail
	// here someone can plausibly mark as spam, and sharing a domain with
	// verification/email-change mail lets those complaints drag the auth
	// path's deliverability down with them. That's a DNS change plus this one
	// env var, not a code change.
	EMAIL_FROM_NOTIFICATIONS: z
		.string()
		.default("Called My Shot <results@mail.calledmyshot.com>"),
	// Mail that is neither an account action nor an answer to something this
	// person did - the season announcements, and any broadcast after them.
	// To a mailbox provider this is marketing, and it is judged as marketing:
	// it is unsolicited from the reader's point of view, it goes to the whole
	// list at once, and it is the only mail here anyone has a real reason to
	// report as spam.
	//
	// On mail.calledmyshot.com like the other two, because that is the only
	// domain verified in Resend and a default pointing anywhere else fails
	// every send. Own subdomain eventually: reputation is scored per domain,
	// so complaints on this stream currently land on the same domain that
	// carries password resets. That is a DNS change plus this one default,
	// no code, whenever the volume makes it worth doing.
	EMAIL_FROM_ANNOUNCEMENTS: z
		.string()
		.default("Called My Shot <hello@mail.calledmyshot.com>"),
	// Signs unsubscribe links. Optional here so local dev needs no setup;
	// production is enforced by assertProductionConfig() at startup rather
	// than in this schema - see there for why.
	EMAIL_UNSUBSCRIBE_SECRET: z.string().min(32).optional(),
	// Resend's webhook signing secret ("whsec_..."), used to verify bounce and
	// spam-complaint events. Without it routes/webhooks.ts refuses every
	// request rather than trusting an unverified one.
	RESEND_WEBHOOK_SECRET: z.string().optional(),
	// PostHog project key for server-side events (lib/analytics-outbox.ts).
	// Unset everywhere but production, so local runs never send into
	// production analytics. Without it the outbox holds its rows, and they go
	// out with their original timestamps once a key is set.
	POSTHOG_KEY: z.string().optional(),
	// The OAuth client for "Continue with Google". Optional so local dev needs
	// no setup: without both, the Google routes redirect back with an error
	// rather than starting a flow that can't finish.
	GOOGLE_CLIENT_ID: z.string().optional(),
	GOOGLE_CLIENT_SECRET: z.string().optional(),
	// Cloudflare R2, for avatars and group logos/banners (lib/storage.ts).
	// Optional everywhere: without them uploads refuse with a clear error and
	// every image falls back to its initial, which is a fine local setup.
	R2_ACCOUNT_ID: z.string().optional(),
	R2_ACCESS_KEY_ID: z.string().optional(),
	R2_SECRET_ACCESS_KEY: z.string().optional(),
	R2_BUCKET: z.string().optional(),
	// Where the bucket is publicly readable: the custom domain in production,
	// the r2.dev URL locally. No trailing slash.
	R2_PUBLIC_URL: z
		.url()
		.transform((url) => url.replace(/\/+$/, ""))
		.optional(),
})

export const env = envSchema.parse(process.env)

// Checked when the server actually starts, NOT while parsing the schema
// above. Plenty of things import this module without ever serving a request
// or sending mail - notably `pnpm --filter api schema:print`, which the web
// app's Dockerfile runs at build time against a stub .env that sets
// NODE_ENV=production. Enforcing it at parse time failed that build, which is
// the wrong place to discover a missing mail secret.
//
// Only EMAIL_UNSUBSCRIBE_SECRET is fatal. Without it the signing key silently
// falls back to a constant that is committed to this repo, so every
// unsubscribe link in production would be forgeable by anyone who read it.
// The other mail settings degrade honestly instead: no RESEND_API_KEY logs
// rather than sends, and no RESEND_WEBHOOK_SECRET makes the webhook refuse
// unverified payloads.
export function assertProductionConfig(): void {
	if (env.NODE_ENV !== "production") return
	if (!env.EMAIL_UNSUBSCRIBE_SECRET) {
		throw new Error(
			"EMAIL_UNSUBSCRIBE_SECRET is required in production - without it unsubscribe links are signed with a key committed to this repo.",
		)
	}
}
