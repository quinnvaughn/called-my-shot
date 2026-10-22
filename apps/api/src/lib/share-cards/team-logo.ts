const LOGO_TIMEOUT_MS = 2000

// A team logo inlined for satori, which can't fetch images itself. Logos are
// hotlinked from the league's CDN, so a slow or missing one gives null and
// the card draws its fallback instead of failing.
export async function logoDataUri(url: string | null): Promise<string | null> {
	if (!url) return null
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
		})
		if (!response.ok) return null
		const type = response.headers.get("content-type") ?? "image/png"
		const bytes = Buffer.from(await response.arrayBuffer())
		return `data:${type};base64,${bytes.toString("base64")}`
	} catch {
		return null
	}
}
