export type DevicePlatform = "ios" | "android" | "desktop"

export function detectDevicePlatform(): DevicePlatform {
	const ua = navigator.userAgent
	if (/iPhone|iPad|iPod/.test(ua)) return "ios"
	// iPadOS Safari reports a desktop Mac user agent; touch support is the tell.
	if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "ios"
	if (/Android/.test(ua)) return "android"
	return "desktop"
}
