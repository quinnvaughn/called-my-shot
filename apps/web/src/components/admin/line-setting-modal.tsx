import { updateLineSettingSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { AdminCallout } from "#/components/ui/admin-callout"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"
import { ToggleRow } from "#/components/ui/toggle-row"
import {
	AdminResetLineSettingDocument,
	AdminUpdateLineSettingDocument,
} from "#/graphql/admin/calibration/mutations"
import { ApiError } from "#/graphql/api-error"
import {
	AdminLineSettingsDocument,
	type AdminLineSettingsQuery,
} from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { gqlQueryPrefix } from "#/graphql/query-options"
import { closeModal } from "#/stores/modal-store"

type LineSetting = Extract<
	AdminLineSettingsQuery["adminLineSettings"],
	{ __typename: "QueryAdminLineSettingsSuccess" }
>["data"][number]

type Field = "shade" | "minLine" | "minGames"

const FIELDS: { key: Field; label: string; step: string; help: string }[] = [
	{
		key: "shade",
		label: "Shade",
		step: "0.01",
		help: "The player's per-game average is multiplied by this before the line is set. Raise it when the over hits too often, lower it when the under does.",
	},
	{
		key: "minLine",
		label: "Lowest line",
		step: "1",
		help: "A player whose line would come out lower than this is skipped for the next one.",
	},
	{
		key: "minGames",
		label: "Minimum games",
		step: "1",
		help: "A player with fewer games than this, counting last season's stand-ins, is skipped for the next one.",
	},
]

type Props = {
	setting: LineSetting
}

// Edits the settings one generated over/under template's lines are set from -
// see adminUpdateLineSetting.
export function LineSettingModal({ setting }: Props) {
	const queryClient = useQueryClient()
	const updateSetting = useGqlMutation(AdminUpdateLineSettingDocument)
	const resetSetting = useGqlMutation(AdminResetLineSettingDocument)
	const [autoTune, setAutoTune] = useState(setting.autoTune)
	const [values, setValues] = useState<Record<Field, string>>({
		shade: String(setting.line.shade),
		minLine: String(setting.line.minLine),
		minGames: String(setting.line.minGames),
	})
	const [fieldErrors, setFieldErrors] = useState<
		Partial<Record<Field, string>>
	>({})
	const [formError, setFormError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)

	function done() {
		closeModal()
		queryClient.invalidateQueries({
			queryKey: gqlQueryPrefix(AdminLineSettingsDocument),
		})
	}

	function changeAutoTune(on: boolean) {
		setAutoTune(on)
		// Back on automatic, the shade is the job's again.
		if (on) {
			setValues((current) => ({
				...current,
				shade: String(setting.line.shade),
			}))
		}
	}

	async function handleSave() {
		setFormError(null)
		setFieldErrors({})

		const input = {
			leagueSlug: setting.leagueSlug,
			templateId: setting.templateId,
			shade: Number(values.shade),
			minLine: Number(values.minLine),
			minGames: Number(values.minGames),
			autoTune,
		}
		const parsed = updateLineSettingSchema.safeParse(input)
		if (!parsed.success) {
			const errors: Partial<Record<Field, string>> = {}
			for (const issue of parsed.error.issues) {
				const field = issue.path[0]
				if (field === "shade" || field === "minLine" || field === "minGames") {
					errors[field] ??= issue.message
				}
			}
			setFieldErrors(errors)
			return
		}

		setSubmitting(true)
		try {
			const data = await updateSetting.mutateAsync({ input: parsed.data })
			match(data.adminUpdateLineSetting)
				.with({ __typename: "ValidationError" }, (r) => {
					setFormError(
						r.fieldErrors?.[0]?.message ?? "Check the settings and try again.",
					)
				})
				.with(ApiError, (r) => setFormError(r.message))
				.with({ __typename: "LineSetting" }, done)
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
				templateId: setting.templateId,
			})
			match(data.adminResetLineSetting)
				.with({ __typename: "ValidationError" }, () =>
					setFormError("Couldn't go back to the defaults. Try again."),
				)
				.with(ApiError, (r) => setFormError(r.message))
				.with({ __typename: "LineSetting" }, done)
				.exhaustive()
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>
				{setting.leagueSlug.toUpperCase()} {setting.templateId}
			</Modal.Title>
			<VStack gap="4" alignItems="stretch">
				{setting.setByGameModel ? (
					<p
						className={css({
							fontSize: "sm",
							lineHeight: "1.55",
							color: "fg.muted",
						})}
					>
						These lines come from the game model: each one sits where the over
						is closest to even across past games replayed at that game's
						expected scores. The shade only sets lines before the league has
						enough history for the model, so it isn't adjusted automatically.
					</p>
				) : (
					<ToggleRow
						label="Adjust shade automatically"
						description="Once enough of its lines have resolved, the shade moves a little each day toward the over hitting half the time. Turn off to set it yourself."
						checked={autoTune}
						onChange={changeAutoTune}
					/>
				)}

				{FIELDS.map((field) => {
					const tuned =
						field.key === "shade" && autoTune && !setting.setByGameModel
					return (
						<TextInput
							key={field.key}
							error={fieldErrors[field.key]}
							description={
								tuned
									? "Set by the daily adjustment while it's on."
									: `${field.help} Default ${setting.defaultLine[field.key]}.`
							}
						>
							<TextInput.Label>{field.label}</TextInput.Label>
							<TextInput.Group>
								<TextInput.Field
									type="number"
									inputMode="decimal"
									step={field.step}
									disabled={tuned}
									value={values[field.key]}
									onChange={(e) =>
										setValues((current) => ({
											...current,
											[field.key]: e.target.value,
										}))
									}
								/>
							</TextInput.Group>
						</TextInput>
					)
				})}

				<AdminCallout>
					Applies to lines set from now on. Over/unders already posted keep
					their line.
				</AdminCallout>

				<FormError message={formError} />
			</VStack>
			<HStack justify="space-between" gap="3">
				{setting.isCustom ? (
					<Button variant="outline" disabled={submitting} onClick={handleReset}>
						Use defaults
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
