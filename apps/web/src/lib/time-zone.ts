import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { createIsomorphicFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"
import { IANAZone } from "luxon"

// Browsers don't send their time zone with a request, so the client writes it
// here and SSR reads it back. Until the first visit has set it, the server has
// nothing to go on and renders the sports zone instead.
const TIME_ZONE_COOKIE = "tz"
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function browserTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// The zone to render times in for this request. Carried on the root route's
// context, which hydration restores from the server's copy, so the server's
// answer is also what the client's first render uses.
export const requestTimeZone = createIsomorphicFn()
	.server(() => readTimeZoneCookie(getRequestHeader("cookie")))
	.client(() => browserTimeZone())

function readTimeZoneCookie(header: string | undefined): string {
	const raw = header
		?.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${TIME_ZONE_COOKIE}=`))
		?.slice(TIME_ZONE_COOKIE.length + 1)
	if (!raw) return SPORTS_TIME_ZONE
	try {
		const zone = decodeURIComponent(raw)
		return IANAZone.isValidZone(zone) ? zone : SPORTS_TIME_ZONE
	} catch {
		return SPORTS_TIME_ZONE
	}
}

export function rememberTimeZone(): void {
	const zone = encodeURIComponent(browserTimeZone())
	if (document.cookie.includes(`${TIME_ZONE_COOKIE}=${zone}`)) return
	// biome-ignore lint/suspicious/noDocumentCookie: cookieStore is missing from older Safari
	document.cookie = `${TIME_ZONE_COOKIE}=${zone}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`
}
