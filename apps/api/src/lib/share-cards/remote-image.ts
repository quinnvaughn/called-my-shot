const FETCH_TIMEOUT_MS = 2000

// A remote image inlined as a data URI, since satori can't fetch images
// itself. Anything slow, missing or unreachable gives null, so the card draws
// its fallback instead of failing.
export async function fetchDataUri(
	url: string | null,
	timeoutMs = FETCH_TIMEOUT_MS,
): Promise<string | null> {
	if (!url) return null
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(timeoutMs),
		})
		if (!response.ok) return null
		const type = response.headers.get("content-type") ?? "image/png"
		const bytes = Buffer.from(await response.arrayBuffer())
		return `data:${type};base64,${bytes.toString("base64")}`
	} catch {
		return null
	}
}
