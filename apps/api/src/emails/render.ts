import { render } from "@react-email/render"
import type { ReactElement } from "react"

// Rendered here rather than handed to Resend as its `react:` field, which
// would do the same job: this way the plain-text part comes off the same
// element tree as the HTML (so the two can't describe different results),
// both parts are assertable in a test without a Resend key, and the mailer's
// no-key dev branch logs real output instead of an empty body.
export async function renderEmail(
	element: ReactElement,
): Promise<{ html: string; text: string }> {
	const [html, text] = await Promise.all([
		render(element),
		render(element, { plainText: true }),
	])
	return { html, text }
}
