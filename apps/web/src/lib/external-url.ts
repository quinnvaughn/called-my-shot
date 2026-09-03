// Guard for any user-supplied URL that gets rendered into an href
// (resolution source links, mostly). resolutionSourceUrlSchema already
// rejects everything but http/https on the way in, so this is about rows
// written before it did: a stored `javascript:` URL is a click away from
// running in whoever opens the page, and dropping the link entirely is the
// only safe way to render one.
export function safeExternalUrl(value: string | null | undefined) {
	if (!value) return null
	let url: URL
	try {
		url = new URL(value)
	} catch {
		return null
	}
	return url.protocol === "http:" || url.protocol === "https:" ? value : null
}
