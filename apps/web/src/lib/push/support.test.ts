import { describe, expect, it } from "vitest"
import { iosVersion, type PushEnvironment, pushAvailability } from "./support"

const IPHONE_17 =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
const IPHONE_16_3 =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1"
const IPAD_AS_MAC =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
const INSTAGRAM =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 321.0.0.0.0"
const FACEBOOK =
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0.0.0;]"
const ANDROID_CHROME =
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
const DESKTOP_CHROME =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

const env = (overrides: Partial<PushEnvironment>): PushEnvironment => ({
	userAgent: DESKTOP_CHROME,
	maxTouchPoints: 0,
	standalone: false,
	hasServiceWorker: true,
	hasPushManager: true,
	hasNotification: true,
	...overrides,
})

describe("pushAvailability", () => {
	it("asks an iPhone in Safari to add the app to the Home Screen first", () => {
		expect(
			pushAvailability(
				env({ userAgent: IPHONE_17, maxTouchPoints: 5, hasPushManager: false }),
			),
		).toBe("needs_install")
	})

	it("lets the Home Screen app on an iPhone turn push on", () => {
		expect(
			pushAvailability(
				env({ userAgent: IPHONE_17, maxTouchPoints: 5, standalone: true }),
			),
		).toBe("supported")
	})

	it("has nothing to offer an iPhone older than 16.4", () => {
		expect(
			pushAvailability(env({ userAgent: IPHONE_16_3, maxTouchPoints: 5 })),
		).toBe("unsupported")
	})

	it("treats an iPad reporting a Mac user agent as iOS", () => {
		expect(
			pushAvailability(env({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 })),
		).toBe("needs_install")
		expect(iosVersion(IPAD_AS_MAC)).toBeCloseTo(17.04)
	})

	it.each([
		["Instagram", INSTAGRAM],
		["Facebook", FACEBOOK],
	])("sends someone in %s's browser to a real one", (_name, userAgent) => {
		expect(pushAvailability(env({ userAgent, maxTouchPoints: 5 }))).toBe(
			"in_app_browser",
		)
	})

	it("lets Android and desktop browsers turn push on from a tab", () => {
		expect(pushAvailability(env({ userAgent: ANDROID_CHROME }))).toBe(
			"supported",
		)
		expect(pushAvailability(env({ userAgent: DESKTOP_CHROME }))).toBe(
			"supported",
		)
	})

	it("has nothing to offer a browser without the push APIs", () => {
		expect(pushAvailability(env({ hasPushManager: false }))).toBe("unsupported")
	})
})
