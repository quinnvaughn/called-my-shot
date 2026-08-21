import { Resend } from "resend"
import { env } from "../env"

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

// No RESEND_API_KEY locally - just logs what would have been sent instead of
// requiring every dev to have a Resend key to run the app.
export async function sendMail(to: string, subject: string, body: string) {
	if (!resend) {
		console.log(`[mailer] to=${to} subject=${JSON.stringify(subject)}\n${body}`)
		return
	}

	const { error } = await resend.emails.send({
		from: env.EMAIL_FROM,
		to,
		subject,
		text: body,
	})

	if (error) {
		console.error(`[mailer] failed to send to=${to}:`, error)
	}
}
