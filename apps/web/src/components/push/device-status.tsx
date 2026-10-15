import { match } from "ts-pattern"
import { detectDevicePlatform } from "#/lib/device-platform"
import type { PromptState } from "#/lib/push/prompt-state"
import { muted } from "./styles"

// The settings page's account of this device, for the states with nothing to
// offer.
export function DeviceStatus({ state }: { state: PromptState }) {
	const text = match(state)
		.with("on", () => "On for this device.")
		.with("denied", () =>
			detectDevicePlatform() === "ios"
				? "Notifications are blocked. Turn them back on in your iPhone's Settings, under Notifications, then Called My Shot."
				: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back here.",
		)
		.with(
			"unsupported",
			() =>
				"This browser can't get notifications. Use a current version of Safari, Chrome, Firefox or Edge.",
		)
		.otherwise(() => null)
	return text ? <p className={muted}>{text}</p> : null
}
