import type { ReactElement } from "react"
import type { EmailPreferenceType } from "../db/schema"
import { renderEmail } from "../emails/render"
import { env } from "../env"
import { type EmailCampaign, emailUrl, withUtm } from "./email-links"
import { oneClickUnsubscribeUrl, unsubscribePageUrl } from "./email-unsubscribe"
import type { MailResult, sendMail } from "./mailer"

// What every drain sends through. Injectable so tests can assert on what
// would have gone out without a Resend key.
export type SendFn = typeof sendMail

// The footer props every list email's layout takes.
export type ListEmailLinks = {
	manageUrl: string
	unsubscribeUrl: string
	logoUrl: string
}

// One notification email to one person, with everything a list email owes the
// reader and the mailbox providers: the footer's manage and unsubscribe links,
// the one-click unsubscribe headers, and the Resend `type` tag. `type` is the
// preference the unsubscribe links mute; `campaign` is the utm and tag value.
export async function sendListEmail(
	{
		userId,
		to,
		type,
		campaign,
		from,
		subject,
		render,
		extraTags = [],
	}: {
		userId: string
		to: string
		type: EmailPreferenceType
		campaign: EmailCampaign
		from: string
		subject: string
		render: (links: ListEmailLinks) => ReactElement
		extraTags?: { name: string; value: string }[]
	},
	send: SendFn,
): Promise<MailResult> {
	const { html, text } = await renderEmail(
		render({
			manageUrl: emailUrl("/settings", { campaign, content: "manage" }),
			unsubscribeUrl: withUtm(unsubscribePageUrl(userId, type), {
				campaign,
				content: "unsubscribe",
			}),
			logoUrl: `${env.CLIENT_ORIGIN}/email-logo.png`,
		}),
	)

	return send({
		to,
		from,
		subject,
		text,
		html,
		headers: {
			// Gmail and Yahoo's bulk-sender rules require one-click unsubscribe
			// on mail like this, and an easy opt-out is cheaper than a spam
			// complaint either way. Deliberately untagged, unlike the footer
			// link: nothing renders a pageview here, the mail client POSTs it
			// on the reader's behalf, so utm params would only add noise to a
			// url that has to stay exactly parseable by someone else's code.
			"List-Unsubscribe": `<${oneClickUnsubscribeUrl(userId, type)}>`,
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		},
		tags: [{ name: "type", value: campaign }, ...extraTags],
	})
}
