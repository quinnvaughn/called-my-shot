import express, { type Express } from "express"
import { env } from "../env"
import { recordEmailBounce, recordSpamComplaint } from "../lib/email-bounce"
import {
	isPermanentBounce,
	type ResendEvent,
	recipientOf,
	verifyResendSignature,
} from "../lib/resend-webhook"

// Registered ahead of the GraphQL mount (which applies express.json() to
// everything under "/") so the body arrives as raw bytes - the Svix signature
// is over the exact bytes Resend sent, and a parse/re-serialize round trip
// would invalidate it.
//
// Reached through the web app's /webhooks/resend proxy rather than directly:
// the api has no public ingress, same as routes/share.ts.
export function registerWebhookRoutes(app: Express) {
	app.post(
		"/webhooks/resend",
		express.raw({ type: "*/*" }),
		async (req, res) => {
			if (!env.RESEND_WEBHOOK_SECRET) {
				// Nothing to verify against means we can't tell a real delivery
				// event from anyone who found the url - refuse rather than trust it.
				console.error("[webhooks] RESEND_WEBHOOK_SECRET is not set")
				res.status(503).end()
				return
			}

			const rawBody = Buffer.isBuffer(req.body)
				? req.body.toString("utf8")
				: String(req.body)

			const verified = verifyResendSignature(
				rawBody,
				{
					id: req.header("svix-id"),
					timestamp: req.header("svix-timestamp"),
					signature: req.header("svix-signature"),
				},
				env.RESEND_WEBHOOK_SECRET,
			)
			if (!verified) {
				res.status(401).end()
				return
			}

			let event: ResendEvent
			try {
				event = JSON.parse(rawBody)
			} catch {
				res.status(400).end()
				return
			}

			const email = recipientOf(event)
			if (email) {
				if (event.type === "email.bounced" && isPermanentBounce(event)) {
					await recordEmailBounce(
						email,
						event.data.bounce?.message ?? event.data.bounce?.subType ?? null,
					)
				} else if (event.type === "email.complained") {
					await recordSpamComplaint(email)
				} else if (event.type === "email.failed") {
					// Logged, deliberately not flagged. A failure is the send not
					// getting out - our request, Resend's infrastructure, a
					// suppression-list block - which says nothing about whether the
					// recipient's address works. Raising the bounce banner on it
					// would tell someone to replace a perfectly good address
					// because we broke. The one case that does mean a dead address
					// (suppressed after an earlier hard bounce) already got flagged
					// by that original email.bounced.
					console.error(
						`[webhooks] send failed to=${email}: ${event.data.failed?.reason ?? "no reason given"}`,
					)
				}
			}

			// 200 for every event we understood the shape of, including the ones
			// we do nothing with (delivered, opened, ...). A non-2xx makes Svix
			// retry, and there is nothing to retry for an event we ignored on
			// purpose.
			res.status(200).end()
		},
	)
}
