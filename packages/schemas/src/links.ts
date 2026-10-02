import { z } from "zod"

// Outbound links (socials, websites) an owner attaches to something they run.
// Only the url is stored. Which platform a link belongs to is worked out from
// its hostname every time it's read, so adding a platform here upgrades links
// saved before it existed, with no migration.
//
// apps/web keys its icon map on LinkPlatformId, so a platform added here
// fails the web typecheck until it has an icon.

type LinkPlatform = {
	id: string
	name: string
	// Matched exactly or as a parent domain: "substack.com" covers
	// "foo.substack.com".
	hosts: readonly string[]
	// The account the link points at, as the platform writes it ("@name",
	// "r/name"). Null when the url isn't a profile, e.g. a single post, which
	// then reads as the platform's name.
	handle?: (url: URL, segments: string[]) => string | null
}

// "/name" and nothing after it. A longer path is a post or a page under the
// account, not the account.
function soleSegment(segments: string[]) {
	return segments.length === 1 ? segments[0] : null
}

function atHandle(_url: URL, segments: string[]) {
	const name = soleSegment(segments)
	if (!name) return null
	return name.startsWith("@") ? name : `@${name}`
}

// For platforms whose profile path is "/@name", where a bare "/name" is
// something else (a TikTok tag page, a YouTube legacy url).
function prefixedAtHandle(_url: URL, segments: string[]) {
	const name = soleSegment(segments)
	return name?.startsWith("@") ? name : null
}

function subdomainHandle(url: URL) {
	const sub = url.hostname.split(".")[0]
	return sub && sub !== "www" ? sub : null
}

export const LINK_PLATFORMS = [
	{ id: "x", name: "X", hosts: ["x.com", "twitter.com"], handle: atHandle },
	{
		id: "instagram",
		name: "Instagram",
		hosts: ["instagram.com"],
		handle: atHandle,
	},
	{
		id: "tiktok",
		name: "TikTok",
		hosts: ["tiktok.com"],
		handle: prefixedAtHandle,
	},
	{
		id: "youtube",
		name: "YouTube",
		hosts: ["youtube.com", "youtu.be"],
		handle: prefixedAtHandle,
	},
	{ id: "twitch", name: "Twitch", hosts: ["twitch.tv"], handle: atHandle },
	{ id: "kick", name: "Kick", hosts: ["kick.com"], handle: atHandle },
	{ id: "discord", name: "Discord", hosts: ["discord.gg", "discord.com"] },
	{
		id: "reddit",
		name: "Reddit",
		hosts: ["reddit.com", "redd.it"],
		handle: (_url, segments) => {
			const [kind, name] = segments
			if (!name || segments.length > 2) return null
			if (kind === "r") return `r/${name}`
			if (kind === "u" || kind === "user") return `u/${name}`
			return null
		},
	},
	{
		id: "bluesky",
		name: "Bluesky",
		hosts: ["bsky.app"],
		handle: (_url, segments) =>
			segments.length === 2 && segments[0] === "profile"
				? `@${segments[1]}`
				: null,
	},
	{
		id: "threads",
		name: "Threads",
		hosts: ["threads.net", "threads.com"],
		handle: prefixedAtHandle,
	},
	{ id: "facebook", name: "Facebook", hosts: ["facebook.com", "fb.com"] },
	{ id: "snapchat", name: "Snapchat", hosts: ["snapchat.com"] },
	{ id: "linkedin", name: "LinkedIn", hosts: ["linkedin.com"] },
	{ id: "patreon", name: "Patreon", hosts: ["patreon.com"], handle: atHandle },
	{
		id: "substack",
		name: "Substack",
		hosts: ["substack.com"],
		handle: subdomainHandle,
	},
	{ id: "spotify", name: "Spotify", hosts: ["spotify.com"] },
] as const satisfies readonly LinkPlatform[]

export type LinkPlatformId = (typeof LINK_PLATFORMS)[number]["id"]

// Hostname with the prefixes that don't change what site it is stripped, so
// "m.youtube.com" and "www.x.com" match like their bare forms and a plain
// website's label doesn't lead with "www.".
function parseUrl(value: string): URL | null {
	try {
		return new URL(value)
	} catch {
		return null
	}
}

function bareHost(url: URL) {
	return url.hostname.replace(/^(www|m|mobile)\./, "")
}

function platformFor(host: string): LinkPlatform | undefined {
	return LINK_PLATFORMS.find((platform) =>
		platform.hosts.some((h) => host === h || host.endsWith(`.${h}`)),
	)
}

export type DescribedLink = {
	platform: LinkPlatformId | "website"
	label: string
}

// What a stored link shows as: the owner's own label when they set one,
// otherwise the account it points at, otherwise the platform's name, and for
// anything unrecognised its hostname.
export function describeLink(
	url: string,
	label?: string | null,
): DescribedLink {
	const parsed = parseUrl(url)
	if (!parsed) return { platform: "website", label: label || url }

	const host = bareHost(parsed)
	const platform = platformFor(host)
	if (!platform) return { platform: "website", label: label || host }

	const segments = parsed.pathname.split("/").filter(Boolean)
	return {
		platform: platform.id as LinkPlatformId,
		label: label || platform.handle?.(parsed, segments) || platform.name,
	}
}

// What an owner types, as the url that gets stored: a missing scheme becomes
// https (most people paste "instagram.com/foo"), and anything that isn't
// http(s) is refused so a "javascript:" link can never reach an href. Null
// for something that isn't a usable web address.
export function normalizeLinkUrl(raw: string): string | null {
	const trimmed = raw.trim()
	if (!trimmed) return null
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
		? trimmed
		: `https://${trimmed}`
	const url = parseUrl(withScheme)
	if (!url) return null
	if (url.protocol !== "https:" && url.protocol !== "http:") return null
	// A bare word ("https://foo") parses, but isn't a site anyone can visit.
	if (!url.hostname.includes(".")) return null
	if (url.username || url.password) return null
	url.hash = ""
	// "x.com/foo/" and "x.com/foo" are the same page, and the unique check
	// should see them as the same link.
	return !url.search && url.href.endsWith("/")
		? url.href.slice(0, -1)
		: url.href
}

export const LINK_URL_MAX = 500
export const LINK_LABEL_MAX = 40
export const GROUP_LINKS_MAX = 6

export const linkSchema = z.object({
	url: z
		.string()
		.max(LINK_URL_MAX, "That link is too long")
		.transform((raw, ctx) => {
			const url = normalizeLinkUrl(raw)
			if (!url) {
				ctx.addIssue({ code: "custom", message: "Enter a valid link" })
				return z.NEVER
			}
			return url
		}),
	// Blank means "label it for me" (see describeLink). The api stores null.
	label: z
		.string()
		.trim()
		.max(LINK_LABEL_MAX, `Labels must be ${LINK_LABEL_MAX} characters or fewer`)
		.optional(),
})
export type LinkInput = z.input<typeof linkSchema>

export const linksSchema = z
	.array(linkSchema)
	.max(GROUP_LINKS_MAX, `Add up to ${GROUP_LINKS_MAX} links`)
	.superRefine((links, ctx) => {
		const seen = new Set<string>()
		links.forEach((link, index) => {
			if (seen.has(link.url)) {
				ctx.addIssue({
					code: "custom",
					message: "You've already added this link",
					path: [index, "url"],
				})
			}
			seen.add(link.url)
		})
	})
