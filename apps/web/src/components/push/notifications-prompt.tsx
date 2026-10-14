import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import type { PushState } from "#/hooks/use-push-state"
import { type PushPromptReason, type PushSurface, track } from "#/lib/analytics"
import { detectDevicePlatform } from "#/lib/device-platform"
import { enablePush } from "#/lib/push/client"
import type { PromptState } from "#/lib/push/prompt-state"
import { isStandalone } from "#/lib/push/support"
import { openModal } from "#/stores/modal-store"
import { InstallStepsSheet } from "./install-steps-sheet"

// What notifications would tell this person, given what they just did.
export function reasonCopy(reason: PushPromptReason): string {
	return match(reason)
		.with("call", () => "Get a notification when your calls settle.")
		.with(
			"challenge_created",
			() =>
				"Get a notification when someone accepts your challenge and when it settles.",
		)
		.with(
			"challenge_accepted",
			() => "Get a notification when this challenge settles.",
		)
		.with(
			"group_joined",
			() =>
				"Get a notification when people join this group and share calls to it.",
		)
		.exhaustive()
}

const muted = css({ fontSize: "sm", color: "fg.muted", lineHeight: "relaxed" })

// The action half of the push card and of the settings section: whichever of
// turning push on, the iPhone Home Screen steps, or leaving an in-app browser
// this device needs. Callers decide when it shows; this only renders the
// offer for `state`.
export function PushOffer({
	state,
	push,
	surface,
}: {
	state: "enable" | "install" | "in_app_browser"
	push: PushState
	surface: PushSurface
}) {
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [copied, setCopied] = useState(false)

	// Nothing awaited before enablePush: Safari only shows the permission
	// prompt inside the tap itself.
	function handleEnable() {
		if (!push.publicKey) return
		track("push_permission_requested", { surface })
		setBusy(true)
		setError(null)
		void enablePush(push.publicKey).then((result) => {
			setBusy(false)
			match(result)
				.with("enabled", () => {
					track("push_enabled", {
						surface,
						platform: detectDevicePlatform(),
						standalone: isStandalone(),
					})
				})
				.with("denied", () => {
					track("push_permission_denied", { surface })
				})
				.with("failed", () => {
					setError("That didn't work. Try again.")
				})
				.exhaustive()
			push.refresh()
		})
	}

	function handleCopy() {
		void navigator.clipboard
			?.writeText(window.location.href)
			.then(() => setCopied(true))
			.catch(() => {})
	}

	return match(state)
		.with("enable", () => (
			<VStack alignItems="flex-start" gap="2">
				<Button
					size="sm"
					variant="solid"
					onClick={handleEnable}
					disabled={busy}
				>
					Turn on notifications
				</Button>
				{error && (
					<span className={css({ fontSize: "xs", color: "danger.default" })}>
						{error}
					</span>
				)}
			</VStack>
		))
		.with("install", () => (
			<VStack alignItems="flex-start" gap="2">
				<p className={muted}>
					iPhone only sends notifications to sites on your Home Screen.
				</p>
				<Button
					size="sm"
					variant="solid"
					onClick={() => {
						track("push_install_steps_opened", { surface })
						openModal(<InstallStepsSheet />)
					}}
				>
					Show me how
				</Button>
			</VStack>
		))
		.with("in_app_browser", () => (
			<VStack alignItems="flex-start" gap="2">
				<p className={muted}>
					This app's built-in browser can't get notifications. Open this page in
					Safari or Chrome to turn them on.
				</p>
				<Button size="sm" variant="outline" onClick={handleCopy}>
					{copied ? "Link copied" : "Copy link"}
				</Button>
			</VStack>
		))
		.exhaustive()
}

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
