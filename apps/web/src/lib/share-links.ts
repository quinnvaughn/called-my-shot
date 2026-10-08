import { useRouteContext } from "@tanstack/react-router"

// What a shared link points at, carried as utm_campaign so an inbound visit
// lines up with the outbound *_link_shared event that sent it.
export type ShareCampaign =
	| "call"
	| "question"
	| "ballot"
	| "game_picks"
	| "streak"
	| "sweep"
	| "report_card"
	| "profile"

export type ShareMethod = "clipboard" | "native" | "x"

export type ShareLanding = {
	campaign: string | null
	method: string | null
	// The signed-in user who sent the link. Analytics only: nothing grants
	// anything off it, since anyone can put any id in a url.
	sharerId: string | null
}

const SOURCE = "share"
const REF_PARAM = "ref"
const SHARE_PARAMS = ["utm_source", "utm_medium", "utm_campaign", REF_PARAM]

// Shares leave through iMessage, WhatsApp, Discord and the like, which send
// no referrer, so without these a visit off a share reads as direct traffic.
// Real utm_* names rather than something shorter because PostHog parses them
// into its own campaign and initial-touch properties on its own.
export function tagShareUrl(
	url: string,
	{
		campaign,
		method,
		sharerId,
	}: { campaign: ShareCampaign; method: ShareMethod; sharerId: string | null },
): string {
	const parsed = new URL(url)
	parsed.searchParams.set("utm_source", SOURCE)
	parsed.searchParams.set("utm_medium", method)
	parsed.searchParams.set("utm_campaign", campaign)
	if (sharerId) parsed.searchParams.set(REF_PARAM, sharerId)
	return parsed.toString()
}

// Splits a landing href (path, search and hash, as the router reports it)
// into the share it came from and the href with the share params removed.
// Only a utm_source=share href is touched, so email links keep their tags.
export function readShareLanding(href: string): {
	landing: ShareLanding | null
	cleanHref: string
} {
	const parsed = new URL(href, "http://localhost")
	const params = parsed.searchParams
	if (params.get("utm_source") !== SOURCE) {
		return { landing: null, cleanHref: href }
	}
	const landing = {
		campaign: params.get("utm_campaign"),
		method: params.get("utm_medium"),
		sharerId: params.get(REF_PARAM),
	}
	for (const key of SHARE_PARAMS) params.delete(key)
	return {
		landing,
		cleanHref: `${parsed.pathname}${parsed.search}${parsed.hash}`,
	}
}

// Tags a url with the signed-in viewer as its sharer. A signed-out viewer
// can still share a public page, and gets the utm tags without a ref.
export function useTagShareUrl(campaign: ShareCampaign | undefined) {
	const { me } = useRouteContext({ from: "__root__" })
	return (url: string, method: ShareMethod) =>
		campaign
			? tagShareUrl(url, { campaign, method, sharerId: me?.id ?? null })
			: url
}
