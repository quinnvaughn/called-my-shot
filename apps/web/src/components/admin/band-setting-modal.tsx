import { updateBandSettingSchema } from "@called-my-shot/schemas"
import { targetHitRate, LOSS_RATE_BY_SHAPE } from "@called-my-shot/scoring"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"
import { ToggleRow } from "#/components/ui/toggle-row"
import type { AdminBandSettingsQuery } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import {
	AdminResetBandSettingDocument,
	AdminUpdateBandSettingDocument,
} from "#/graphql/mutations/admin"
import { closeModal } from "#/stores/modal-store"

type BandSetting = Extract<
	AdminBandSettingsQuery["adminBandSettings"],
	{ __typename: "QueryAdminBandSettingsSuccess" }
>["data"][number]

// An absolute band reads as "±6", a percentage one as "15%".
export function formatTolerance(tolerance: {
	mode: string
	value: number
}): string {
	return tolerance.mode === "absolute"
		? `±${tolerance.value}`
		: `${Math.round(tolerance.value * 100)}%`
}

const TARGET_PERCENT = Math.round(
	targetHitRate(LOSS_RATE_BY_SHAPE.team_stat_numeric_guess) * 100,
)

type Props = {
	setting: BandSetting
	onChanged: () => void
}

// Edits the band one league's team numeric guesses on a stat are created with
// - see adminUpdateBandSetting.
export function BandSettingModal({ setting, onChanged }: Props) {
	const updateSetting = useGqlMutation(AdminUpdateBandSettingDocument)
	const resetSetting = useGqlMutation(AdminResetBandSettingDocument)
	const currentBand =
		setting.tolerance?.mode === "absolute"
			? String(setting.tolerance.value)
			: String(setting.calibration.suggestedBand ?? "")
	const [autoTune, setAutoTune] = useState(setting.autoTune)
	const [band, setBand] = useState(currentBand)
	const [fieldError, setFieldError] = useState<string | null>(null)
	const [formError, setFormError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)

	function done() {
		closeModal()
		onChanged()
	}

	function changeAutoTune(on: boolean) {
		setAutoTune(on)
		// Back on automatic, the band is the job's again.
		if (on) setBand(currentBand)
	}

	async function handleSave() {
		setFormError(null)
		setFieldError(null)

		// Nothing saved and still automatic: there's nothing to change.
		if (autoTune && !setting.isCustom) {
			closeModal()
			return
		}

		const parsed = updateBandSettingSchema.safeParse({
			leagueSlug: setting.leagueSlug,
			statName: setting.statName,
			band: Number(band),
			autoTune,
		})
		if (!parsed.success) {
			setFieldError(parsed.error.issues[0]?.message ?? "Check the band.")
			return
		}

		setSubmitting(true)
		try {
			const data = await updateSetting.mutateAsync({ input: parsed.data })
			match(data.adminUpdateBandSetting)
				.with({ __typename: "ValidationError" }, (r) => {
					setFormError(
						r.fieldErrors?.[0]?.message ?? "Check the band and try again.",
					)
				})
				.with(
					{ __typename: "AuthenticationError" },
					{ __typename: "AuthorizationError" },
					{ __typename: "NotFoundError" },
					(r) => setFormError(r.message),
				)
				.with({ __typename: "BandSetting" }, done)
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
			match(data.adminResetBandSetting)
				.with({ __typename: "ValidationError" }, () =>
					setFormError("Couldn't go back to the default. Try again."),
				)
				.with(
					{ __typename: "AuthenticationError" },
					{ __typename: "AuthorizationError" },
					{ __typename: "NotFoundError" },
					(r) => setFormError(r.message),
				)
				.with({ __typename: "BandSetting" }, done)
				.exhaustive()
		} finally {
			setSubmitting(false)
		}
	}

	const unit = setting.statName.toLowerCase()

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>
				{setting.leagueSlug.toUpperCase()} {setting.statName}
			</Modal.Title>
			<VStack gap="4" alignItems="stretch">
				<ToggleRow
					label="Adjust band automatically"
					description={`Once enough final scores are in, the band moves a little each day toward a guess at a team's own average hitting ${TARGET_PERCENT}% of the time. Turn off to set it yourself.`}
					checked={autoTune}
					onChange={changeAutoTune}
				/>

				<TextInput
					error={fieldError ?? undefined}
					description={
						autoTune
							? "Set by the daily adjustment while it's on."
							: `A guess within this many ${unit} of the final score is a hit. Widen it when guesses hit too rarely, narrow it when they hit too often.${setting.defaultTolerance ? ` Default ${formatTolerance(setting.defaultTolerance)}.` : ""}`
					}
				>
					<TextInput.Label>Band</TextInput.Label>
					<TextInput.Group>
						<TextInput.Field
							type="number"
							inputMode="numeric"
							step="1"
							disabled={autoTune}
							value={band}
							onChange={(e) => setBand(e.target.value)}
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
					Applies to questions created from now on. Numeric guesses already
					posted keep their band.
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
