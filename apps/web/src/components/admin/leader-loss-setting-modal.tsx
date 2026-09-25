import { updateLeaderLossSettingSchema } from "@called-my-shot/schemas"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"
import { ToggleRow } from "#/components/ui/toggle-row"
import type { AdminLeaderLossSettingsQuery } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import {
	AdminResetLeaderLossSettingDocument,
	AdminUpdateLeaderLossSettingDocument,
} from "#/graphql/mutations/admin"
import { closeModal } from "#/stores/modal-store"

type LeaderLossSetting = Extract<
	AdminLeaderLossSettingsQuery["adminLeaderLossSettings"],
	{ __typename: "QueryAdminLeaderLossSettingsSuccess" }
>["data"][number]

type Props = {
	setting: LeaderLossSetting
	onChanged: () => void
}

// Edits the loss rate one league's game stat leader questions on a stat are
// created with - see adminUpdateLeaderLossSetting.
export function LeaderLossSettingModal({ setting, onChanged }: Props) {
	const updateSetting = useGqlMutation(AdminUpdateLeaderLossSettingDocument)
	const resetSetting = useGqlMutation(AdminResetLeaderLossSettingDocument)
	const currentRate = String(setting.lossRate)
	const [autoTune, setAutoTune] = useState(setting.autoTune)
	const [lossRate, setLossRate] = useState(currentRate)
	const [fieldError, setFieldError] = useState<string | null>(null)
	const [formError, setFormError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)

	function done() {
		closeModal()
		onChanged()
	}

	function changeAutoTune(on: boolean) {
		setAutoTune(on)
		// Back on automatic, the rate is the job's again.
		if (on) setLossRate(currentRate)
	}

	async function handleSave() {
		setFormError(null)
		setFieldError(null)

		// Nothing saved and still automatic: there's nothing to change.
		if (autoTune && !setting.isCustom) {
			closeModal()
			return
		}

		const parsed = updateLeaderLossSettingSchema.safeParse({
			leagueSlug: setting.leagueSlug,
			statName: setting.statName,
			lossRate: Number(lossRate),
			autoTune,
		})
		if (!parsed.success) {
			setFieldError(parsed.error.issues[0]?.message ?? "Check the loss rate.")
			return
		}

		setSubmitting(true)
		try {
			const data = await updateSetting.mutateAsync({ input: parsed.data })
			match(data.adminUpdateLeaderLossSetting)
				.with({ __typename: "ValidationError" }, (r) => {
					setFormError(
						r.fieldErrors?.[0]?.message ?? "Check the loss rate and try again.",
					)
				})
				.with(
					{ __typename: "AuthenticationError" },
					{ __typename: "AuthorizationError" },
					{ __typename: "NotFoundError" },
					(r) => setFormError(r.message),
				)
				.with({ __typename: "LeaderLossSetting" }, done)
				.exhaustive()
		} finally {
			setSubmitting(false)
		}
	}

	async function handleReset() {
		setFormError(null)
		setSubmitting(true)
		try {
			const data = await resetSetting.mutateAsync({
				leagueSlug: setting.leagueSlug,
				statName: setting.statName,
			})
			match(data.adminResetLeaderLossSetting)
				.with({ __typename: "ValidationError" }, () =>
					setFormError("Couldn't go back to the default. Try again."),
				)
				.with(
					{ __typename: "AuthenticationError" },
					{ __typename: "AuthorizationError" },
					{ __typename: "NotFoundError" },
					(r) => setFormError(r.message),
				)
				.with({ __typename: "LeaderLossSetting" }, done)
				.exhaustive()
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>
				{setting.leagueSlug.toUpperCase()} {setting.statName} leader
			</Modal.Title>
			<VStack gap="4" alignItems="stretch">
				<ToggleRow
					label="Adjust loss rate automatically"
					description="Once enough leader questions have resolved, the rate moves a little each day toward where a pick on the favorite comes out slightly ahead. Turn off to set it yourself."
					checked={autoTune}
					onChange={changeAutoTune}
				/>

				<TextInput
					error={fieldError ?? undefined}
					description={
						autoTune
							? "Set by the daily adjustment while it's on."
							: `The share of committed points a miss costs, from 0.05 to 1. Lower it when the favorite leads too rarely, raise it when the favorite leads often. Default ${setting.defaultLossRate}.`
					}
				>
					<TextInput.Label>Loss rate</TextInput.Label>
					<TextInput.Group>
						<TextInput.Field
							type="number"
							inputMode="decimal"
							step="0.01"
							disabled={autoTune}
							value={lossRate}
							onChange={(e) => setLossRate(e.target.value)}
						/>
					</TextInput.Group>
				</TextInput>

				<p
					className={css({
						fontSize: "xs",
						lineHeight: "1.55",
						color: "fg.subtle",
						bg: "bg.canvas",
						border: "1px solid {colors.border.default}",
						borderRadius: "lg",
						padding: "3",
					})}
				>
					Applies to leader questions created from now on. Ones already posted
					keep their rate.
				</p>

				<FormError message={formError} />
			</VStack>
			<HStack justify="space-between" gap="3">
				{setting.isCustom ? (
					<Button variant="outline" disabled={submitting} onClick={handleReset}>
						Use default
					</Button>
				) : (
					<span />
				)}
				<HStack gap="3">
					<Button variant="ghost" onClick={closeModal}>
						Cancel
					</Button>
					<Button
						variant="solid"
						loading={submitting}
						disabled={submitting}
						onClick={handleSave}
					>
						Save
					</Button>
				</HStack>
			</HStack>
		</Modal>
	)
}
