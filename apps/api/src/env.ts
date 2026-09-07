import { z } from "zod"

const envSchema = z.object({
	DATABASE_URL: z.url(),
	PORT: z.coerce.number().default(4000),
	CLIENT_ORIGIN: z.url().default("http://localhost:3000"),
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	ALLOW_PROD_SEED: z.coerce.boolean().default(false),
	SUPPORT_EMAIL: z.string().default("support@calledmyshot.local"),
	RESEND_API_KEY: z.string().optional(),
	EMAIL_FROM: z
		.string()
		.default("Called My Shot <noreply@mail.calledmyshot.com>"),
	// A separate sending subdomain from EMAIL_FROM on purpose. Digests are the
	// only mail here someone can plausibly mark as spam, and sharing a domain
	// with verification/email-change mail would let those complaints take the
	// auth path's deliverability down with them.
	EMAIL_FROM_NOTIFICATIONS: z
		.string()
		.default("Called My Shot <results@notifications.calledmyshot.com>"),
	// Signs unsubscribe links. Optional so local dev needs no setup, but
	// required in production - see the superRefine below.
	EMAIL_UNSUBSCRIBE_SECRET: z.string().min(32).optional(),
	// Resend's webhook signing secret ("whsec_..."), used to verify bounce and
	// spam-complaint events. Without it routes/webhooks.ts refuses every
	// request rather than trusting an unverified one.
	RESEND_WEBHOOK_SECRET: z.string().optional(),
})

export const env = envSchema
	.superRefine((value, ctx) => {
		if (value.NODE_ENV === "production" && !value.EMAIL_UNSUBSCRIBE_SECRET) {
			ctx.addIssue({
				code: "custom",
				path: ["EMAIL_UNSUBSCRIBE_SECRET"],
				message:
					"EMAIL_UNSUBSCRIBE_SECRET is required in production - every notification email has to carry a working one-click unsubscribe.",
			})
		}
	})
	.parse(process.env)
