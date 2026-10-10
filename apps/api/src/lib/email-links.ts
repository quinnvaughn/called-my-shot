import { env } from "../env"

// Every link that leaves an email goes through here, so PostHog attributes
// the visit without any client code - it reads utm params straight off the
// pageview.
//
// The four params carry four different questions, which is why none of them
// collapses into another: medium says "this was email at all" (the value
// every analytics tool's channel grouping keys off), campaign says which
// email it was, and content says which link inside that email got clicked -
// the only one that can tell a hero button from the same destination linked
// in the footer.
export type EmailCampaign =
	| "resolution_digest"
	| "season_start"
	| "game_reminder"
	| "product_update"

type Tag = {
	campaign: EmailCampaign
	// Which link in the email this is - "hero", "manage", "unsubscribe".
	// Snake_case, and stable across copy changes: it's a dimension in a
	// PostHog breakdown, so renaming it splits one line into two.
	content: string
}

export function withUtm(url: string, { campaign, content }: Tag): string {
	const parsed = new URL(url)
	parsed.searchParams.set("utm_source", "email")
	parsed.searchParams.set("utm_medium", "email")
	parsed.searchParams.set("utm_campaign", campaign)
	parsed.searchParams.set("utm_content", content)
	return parsed.toString()
}

// The common case: a path on the web app, tagged. `path` starts with "/" and
// may carry its own query string ("/leaderboard?league=nfl") - URL keeps those
// params and the utm ones side by side rather than one clobbering the other.
export function emailUrl(path: string, tag: Tag): string {
	return withUtm(`${env.CLIENT_ORIGIN}${path}`, tag)
}
