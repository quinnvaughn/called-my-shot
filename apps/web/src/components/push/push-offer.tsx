import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import type { PushState } from "#/hooks/use-push-state"
import { type PushSurface, track } from "#/lib/analytics"
import { detectDevicePlatform } from "#/lib/device-platform"
import { enablePush } from "#/lib/push/client"
import { isStandalone } from "#/lib/push/support"
import { openModal } from "#/stores/modal-store"
import { InstallStepsSheet } from "./install-steps-sheet"
import { muted } from "./styles"

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
