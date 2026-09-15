import { Resend } from "resend"
import { env } from "../env"

// Delivery also requires a public CLIENT_ORIGIN. A key in a local .env (kept
// there for the --send scripts, which point CLIENT_ORIGIN at the live site)
// must not turn the dev server's cron drains into real sends to seeded users,
// with every link pointing at localhost.
const resend =
	env.RESEND_API_KEY && env.CLIENT_ORIGIN.startsWith("https://")
		? new Resend(env.RESEND_API_KEY)
		: null

export type MailMessage = {
	to: string
	subject: string
	text: string
	html?: string
	// Defaults to env.EMAIL_FROM. The digest passes EMAIL_FROM_NOTIFICATIONS
	// so its sending reputation stays isolated from auth mail - see env.ts.
	from?: string
	headers?: Record<string, string>
	// Resend dashboard segmentation. Keys aren't scoped per email type, so
	// this is the only way to tell one kind of send from another in their
	// analytics.
	tags?: { name: string; value: string }[]
}

export type MailResult = { ok: true } | { ok: false; error: string }

// Returns failure rather than swallowing it. The outbox drain needs to know
// whether a send actually happened so it can retry, which the previous
// console.error-and-continue version made impossible.
export async function sendMail(message: MailMessage): Promise<MailResult> {
	const from = message.from ?? env.EMAIL_FROM

	// No RESEND_API_KEY locally - just logs what would have been sent instead
	// of requiring every dev to have a Resend key to run the app.
	if (!resend) {
		console.log(
			`[mailer] from=${from} to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
		)
		return { ok: true }
	}

	const { error } = await resend.emails.send({
		from,
		to: message.to,
		subject: message.subject,
		text: message.text,
		...(message.html ? { html: message.html } : {}),
		...(message.headers ? { headers: message.headers } : {}),
		...(message.tags ? { tags: message.tags } : {}),
	})

	if (error) {
		console.error(`[mailer] failed to send to=${message.to}:`, error)
		return { ok: false, error: error.message ?? String(error) }
	}
	return { ok: true }
}
