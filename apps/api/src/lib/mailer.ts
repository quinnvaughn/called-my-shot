// No email provider is wired up yet - this just logs what would have been
// sent. Swapping in a real provider (Resend, Postmark, SES, ...) later means
// replacing the body of this one function, nothing that calls it.
export async function sendMail(to: string, subject: string, body: string) {
	console.log(`[mailer] to=${to} subject=${JSON.stringify(subject)}\n${body}`)
}
