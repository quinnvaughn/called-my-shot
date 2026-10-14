// Whether this browser can turn push on, and if not, what's in the way. Pure
// over its inputs so every combination can be tested without a browser.
export type PushAvailability =
	// Push works here: ask for permission.
	| "supported"
	// An iPhone or iPad not running from the home screen. iOS only lets a
	// site push once it's been added there.
	| "needs_install"
	// Instagram, TikTok and the like open links in their own browser, which
	// can neither push nor add to a home screen.
	| "in_app_browser"
	// An old iOS, or a browser without the APIs.
	| "unsupported"

export type PushEnvironment = {
	userAgent: string
	maxTouchPoints: number
	standalone: boolean
	hasServiceWorker: boolean
	hasPushManager: boolean
	hasNotification: boolean
}

const IN_APP_BROWSER =
	/FBAN|FBAV|Instagram|Line\/|Twitter|TikTok|musical_ly|Snapchat|LinkedInApp|GSA\//

export function isInAppBrowser(userAgent: string): boolean {
	return IN_APP_BROWSER.test(userAgent)
}

export function isIos(userAgent: string, maxTouchPoints: number): boolean {
	if (/iPhone|iPad|iPod/.test(userAgent)) return true
	// iPadOS Safari reports a desktop Mac user agent; touch support is the tell.
	return /Macintosh/.test(userAgent) && maxTouchPoints > 1
}

// "OS 16_4" on an iPhone, "Version/17.4" on an iPad posing as a Mac.
export function iosVersion(userAgent: string): number | null {
	const match =
		userAgent.match(/OS (\d+)_(\d+)/) ??
		userAgent.match(/Version\/(\d+)\.(\d+)/)
	return match ? Number(match[1]) + Number(match[2]) / 100 : null
}

// Home-screen web apps arrived with push in iOS 16.4.
const FIRST_IOS_WITH_PUSH = 16.04

export function pushAvailability(env: PushEnvironment): PushAvailability {
	if (isInAppBrowser(env.userAgent)) return "in_app_browser"
	if (isIos(env.userAgent, env.maxTouchPoints)) {
		const version = iosVersion(env.userAgent)
		if (version !== null && version < FIRST_IOS_WITH_PUSH) return "unsupported"
		// Checked before the APIs: Safari outside the home screen doesn't expose
		// PushManager at all, and that's the install step, not a dead end.
		if (!env.standalone) return "needs_install"
	}
	if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) {
		return "unsupported"
	}
	return "supported"
}

export function isStandalone(): boolean {
	if (typeof window === "undefined") return false
	return (
		window.matchMedia?.("(display-mode: standalone)").matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	)
}

export function readPushEnvironment(): PushEnvironment {
	return {
		userAgent: navigator.userAgent,
		maxTouchPoints: navigator.maxTouchPoints ?? 0,
		standalone: isStandalone(),
		hasServiceWorker: "serviceWorker" in navigator,
		hasPushManager: "PushManager" in window,
		hasNotification: "Notification" in window,
	}
}
