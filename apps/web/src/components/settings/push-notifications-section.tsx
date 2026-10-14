import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { type ReactNode, useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { DeviceStatus, PushOffer } from "#/components/push/notifications-prompt"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FormError } from "#/components/ui/form-error"
import { SaveNote } from "#/components/ui/save-note"
import { ToggleRow } from "#/components/ui/toggle-row"
import { gqlFetch } from "#/graphql/fetcher"
import type { PushPreferenceType } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import {
	SendTestPushDocument,
	SetPushPreferenceDocument,
} from "#/graphql/queries/push"
import { usePushState } from "#/hooks/use-push-state"
import { track } from "#/lib/analytics"
import { disablePush } from "#/lib/push/client"
import { isOfferState, promptStateFor } from "#/lib/push/prompt-state"
import { PUSH_GROUPS, type PushGroup } from "./push-groups"

type Props = {
	// The section heading. Rendered here rather than by the page so it hides
	// along with the section.
	label: ReactNode
	// Opt-outs, the same model as email: absence means on.
	mutedPushTypes: PushPreferenceType[]
}

// Two halves: this device (turn push on or off here, or what's in the way),
// and what's pushed at all, which is account-wide and holds on every device.
// Hidden entirely, heading included, while push is switched off on the api.
export function PushNotificationsSection({ label, mutedPushTypes }: Props) {
	const push = usePushState()
	const state = promptStateFor(push)
	const setPreference = useGqlMutation(SetPushPreferenceDocument)
	const queryClient = useQueryClient()
	const router = useRouter()
	const [savedNote, setSavedNote] = useState<string | null>(null)
	const [formError, setFormError] = useState<string | null>(null)
	const [pending, setPending] = useState<string | null>(null)
	const [deviceBusy, setDeviceBusy] = useState(false)

	if (push.ready && !push.publicKey) return null

	const muted = new Set(mutedPushTypes)
	const mutedAll = muted.has("ALL")
	const groupOn = (group: PushGroup) => !group.types.every((t) => muted.has(t))

	function flash(note: string) {
		setSavedNote(note)
		setTimeout(() => setSavedNote(null), 2500)
	}

	async function toggle(
		key: string,
		types: PushPreferenceType[],
		enabled: boolean,
	) {
		setFormError(null)
		setPending(key)
		try {
			const data = await setPreference.mutateAsync({
				input: { types, enabled },
			})
			await match(data.setPushPreference)
				.with({ __typename: "ValidationError" }, async () => {
					setFormError("That didn't work. Try again.")
				})
				.with({ __typename: "AuthenticationError" }, async () => {
					setFormError("You need to sign in to do that.")
				})
				.with({ __typename: "User" }, async () => {
					track("push_preference_changed", { group: key, enabled })
					await queryClient.invalidateQueries()
					await router.invalidate()
					flash("Saved")
				})
				.exhaustive()
		} catch {
			setFormError("Something went wrong. Try again.")
		} finally {
			setPending(null)
		}
	}

	async function sendTest() {
		setDeviceBusy(true)
		setFormError(null)
		try {
			const { sendTestPush: result } = await gqlFetch(SendTestPushDocument, {})
			match(result)
				.with({ __typename: "TestPushResult" }, ({ delivered }) =>
					delivered > 0
						? flash("Sent. It should arrive in a few seconds.")
						: setFormError(
								"No device took it. Turn notifications off and on again.",
							),
				)
				.with({ __typename: "ValidationError" }, () =>
					setFormError("That didn't work. Try again."),
				)
				.with({ __typename: "AuthenticationError" }, () =>
					setFormError("You need to sign in to do that."),
				)
				.exhaustive()
		} catch {
			setFormError("Something went wrong. Try again.")
		} finally {
			setDeviceBusy(false)
		}
	}

	async function turnOff() {
		setDeviceBusy(true)
		try {
			await disablePush()
			track("push_disabled", {})
		} catch {
			setFormError("Something went wrong. Try again.")
		} finally {
			setDeviceBusy(false)
			push.refresh()
		}
	}

	return (
		<VStack alignItems="stretch" gap="3">
			{label}
			<Card>
				<Card.Body>
					<VStack alignItems="stretch" gap="5">
						<VStack alignItems="stretch" gap="3">
							<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
								This device
							</span>
							{isOfferState(state) ? (
								<PushOffer state={state} push={push} surface="settings" />
							) : (
								<DeviceStatus state={state} />
							)}
							{state === "on" && (
								<HStack gap="2" flexWrap="wrap">
									<Button
										size="sm"
										variant="outline"
										onClick={sendTest}
										disabled={deviceBusy}
									>
										Send a test
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={turnOff}
										disabled={deviceBusy}
									>
										Turn off on this device
									</Button>
								</HStack>
							)}
						</VStack>
						{PUSH_GROUPS.map((group) => (
							<ToggleRow
								key={group.key}
								label={group.label}
								description={
									mutedAll
										? "Turn all notifications back on to change this."
										: group.description
								}
								checked={!mutedAll && groupOn(group)}
								onChange={(checked) =>
									!mutedAll &&
									pending === null &&
									toggle(group.key, group.types, checked)
								}
							/>
						))}
						<ToggleRow
							label="All notifications"
							description="Off means nothing is pushed to any of your devices. The inbox in the app still fills up."
							checked={!mutedAll}
							onChange={(checked) =>
								pending === null && toggle("all", ["ALL"], checked)
							}
						/>
					</VStack>
				</Card.Body>
				<Card.Footer>
					<HStack justify="flex-end" alignItems="center" gap="3" width="full">
						<SaveNote>{savedNote}</SaveNote>
						<FormError message={formError} />
					</HStack>
				</Card.Footer>
			</Card>
		</VStack>
	)
}
