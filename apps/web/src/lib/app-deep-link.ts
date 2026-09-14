// How long to wait for a native app to take over before assuming it isn't
// installed and sending the browser to the web fallback instead.
const APP_HANDOFF_TIMEOUT_MS = 1500

// iOS has no native fallback for a custom scheme, so the page watches for
// itself being backgrounded. If it's still in front after the timeout, the
// app didn't open and the web URL is the next best thing.
export function openAppWithWebFallback(appUrl: string, webUrl: string) {
	const fallback = window.setTimeout(() => {
		if (!document.hidden) window.location.href = webUrl
	}, APP_HANDOFF_TIMEOUT_MS)
	const cancel = () => window.clearTimeout(fallback)
	document.addEventListener("visibilitychange", cancel, { once: true })
	window.addEventListener("pagehide", cancel, { once: true })
	window.location.href = appUrl
}

// An Android intent URL opens the app directly and lets the browser go to the
// web fallback on its own when the app isn't installed.
export function buildAndroidIntentUrl({
	scheme,
	pathAndQuery,
	packageName,
	fallbackUrl,
}: {
	scheme: string
	pathAndQuery: string
	packageName: string
	fallbackUrl: string
}): string {
	return `intent://${pathAndQuery}#Intent;scheme=${scheme};package=${packageName};S.browser_fallback_url=${encodeURIComponent(
		fallbackUrl,
	)};end`
}
