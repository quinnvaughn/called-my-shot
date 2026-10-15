import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { HStack, VStack } from "styled-system/jsx"
import { match, P } from "ts-pattern"
import type {
	LossSettingConfig,
	LossSettingRow,
} from "#/components/admin/loss-settings"
import { AdminCallout } from "#/components/ui/admin-callout"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"
import { ToggleRow } from "#/components/ui/toggle-row"
import { ApiError } from "#/graphql/api-error"
import { gqlQueryPrefix } from "#/graphql/query-options"
import { closeModal } from "#/stores/modal-store"

type Props<TInput> = {
	config: LossSettingConfig<TInput>
	setting: LossSettingRow
}

// Edits the loss rate one league's questions of a kind are created with.
export function LossSettingModal<TInput>({ config, setting }: Props<TInput>) {
	const queryClient = useQueryClient()
	const currentRate = String(setting.lossRate)
	const [autoTune, setAutoTune] = useState(setting.autoTune)
	const [lossRate, setLossRate] = useState(currentRate)
	const [fieldError, setFieldError] = useState<string | null>(null)
	const [formError, setFormError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)

	function done() {
		closeModal()
		queryClient.invalidateQueries({
			queryKey: gqlQueryPrefix(config.settingsDocument),
		})
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

		const parsed = config.parse(setting, {
			lossRate: Number(lossRate),
			autoTune,
		})
		if (!parsed.success) {
			setFieldError(parsed.error.issues[0]?.message ?? "Check the loss rate.")
			return
		}

		setSubmitting(true)
		try {
			const result = await config.update(parsed.data)
			match(result)
				.with({ __typename: "ValidationError" }, (r) => {
					setFormError(
						r.fieldErrors?.[0]?.message ?? "Check the loss rate and try again.",
					)
				})
				.with(ApiError, (r) => setFormError(r.message))
				.with(
					{ __typename: P.union("LeaderLossSetting", "TitleLossSetting") },
					done,
				)
				.exhaustive()
		} finally {
			setSubmitting(false)
		}
	}

	async function handleReset() {
		setFormError(null)
		setSubmitting(true)
		try {
			const result = await config.reset(setting)
			match(result)
				.with({ __typename: "ValidationError" }, () =>
					setFormError("Couldn't go back to the default. Try again."),
				)
				.with(ApiError, (r) => setFormError(r.message))
				.with(
					{ __typename: P.union("LeaderLossSetting", "TitleLossSetting") },
					done,
				)
				.exhaustive()
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>{config.modalTitle(setting)}</Modal.Title>
			<VStack gap="4" alignItems="stretch">
				<ToggleRow
					label="Adjust loss rate automatically"
					description={config.autoTuneDescription}
					checked={autoTune}
					onChange={changeAutoTune}
				/>

				<TextInput
					error={fieldError ?? undefined}
					description={
						autoTune
							? "Set by the daily adjustment while it's on."
							: `The share of committed points a miss costs, from 0.05 to 1. ${config.manualGuidance} Default ${setting.defaultLossRate}.`
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

				<AdminCallout>
					Applies to {config.questionsLabel} created from now on. Ones already
					posted keep their rate.
				</AdminCallout>

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
