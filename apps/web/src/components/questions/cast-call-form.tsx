import { useMutation } from "@apollo/client/react"
import { castCallSchema } from "@called-my-shot/schemas"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { FiX } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import type { EntitySearchItem } from "#/components/questions/create-question/entity-search-field"
import { EntitySearchField } from "#/components/questions/create-question/entity-search-field"
import { Button } from "#/components/ui/button"
import { FieldLabel } from "#/components/ui/field-label"
import { FormError } from "#/components/ui/form-error"
import { Slider } from "#/components/ui/slider"
import { TextInput } from "#/components/ui/text-input"
import { Textarea } from "#/components/ui/textarea"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { CastCallDocument } from "#/graphql/mutations/calls"
import { useForm } from "#/lib/form/use-form"
import { OptionRow } from "./option-row"

export const CastCallFormFragment = graphql(`
	fragment CastCallForm_question on Question {
		id
		type
		ouLine
		numericTolerancePct
		picksRequired
		options {
			id
			label
			fieldPct
		}
	}
`)

type Props = {
	question: FragmentType<typeof CastCallFormFragment>
}

export function CastCallForm({ question: questionProp }: Props) {
	const question = useFragment(CastCallFormFragment, questionProp)
	const type = question.type.toLowerCase() as
		| "multiple_choice"
		| "yes_no"
		| "over_under"
		| "numeric_guess"
		| "multi_select"
	const [castCall] = useMutation(CastCallDocument)
	const router = useRouter()

	// Only single-select types use this - conviction on the one-and-only
	// selection they can make. multi_select tracks conviction per pick
	// directly in form state instead (each pick's own slider), and
	// numeric_guess uses the schema's own top-level `conviction` field.
	const [singleSelectConviction, setSingleSelectConviction] = useState(50)

	// multi_select only. The pool can run into the dozens (an All-NBA ballot,
	// a championship field), so unlike the other option-based types this
	// isn't a list of clickable rows - it's search-to-add, same pattern
	// EntitySearchField already provides for create-question's option/pool
	// pickers, just searching this question's fixed options instead of an
	// open team/player catalog.
	const [multiSelectSearch, setMultiSelectSearch] = useState("")
	const [convictionMode, setConvictionMode] = useState<"shared" | "split">(
		"shared",
	)
	const [sharedConviction, setSharedConviction] = useState(50)

	const form = useForm({
		schema: castCallSchema,
		defaultValues: {
			type,
			questionId: question.id,
			caseText: "",
			guessValue: undefined,
			conviction: 50,
			selections: [],
		},
		onSubmit: async (values, helpers) => {
			const { data } = await castCall({
				variables: {
					input: {
						questionId: question.id,
						caseText: values.caseText || undefined,
						guessValue: values.guessValue,
						conviction: values.conviction,
						selections: values.selections.map((s) => ({
							optionId: s.optionId,
							conviction: s.conviction,
						})),
					},
				},
			})
			const result = data?.castCall

			if (!result) {
				helpers.setFormError("Something went wrong. Try again.")
				return
			}

			await match(result)
				.with({ __typename: "ValidationError" }, async (r) => {
					const errors: Record<string, string | null> = {}
					for (const fieldError of r.fieldErrors ?? []) {
						if (fieldError.field) errors[fieldError.field] = fieldError.message
						else helpers.setFormError(fieldError.message)
					}
					helpers.setErrors(errors)
				})
				.with({ __typename: "AuthenticationError" }, async () => {
					helpers.setFormError("You need to sign in to make a call.")
				})
				.with({ __typename: "NotFoundError" }, async (r) => {
					helpers.setFormError(r.message)
				})
				.with({ __typename: "CastCallPayload" }, async () => {
					// This page is the destination - refresh in place rather than
					// navigating away, so the pending banner/locked calls list pick
					// up the new viewerCall immediately.
					await router.invalidate()
				})
				.exhaustive()
		},
	})

	const selections = form.useWatch("selections")
	const guessValue = form.useWatch("guessValue")

	function selectSingle(optionId: string) {
		form.setValue("selections", [
			{ optionId, conviction: singleSelectConviction },
		])
	}

	function addMultiSelectPick(optionId: string) {
		const current = form.values().selections
		if (current.some((s) => s.optionId === optionId)) return
		if (
			question.picksRequired !== null &&
			current.length >= question.picksRequired
		) {
			return
		}
		form.setValue("selections", [
			...current,
			{ optionId, conviction: sharedConviction },
		])
		setMultiSelectSearch("")
	}

	function removeMultiSelectPick(optionId: string) {
		form.setValue(
			"selections",
			form.values().selections.filter((s) => s.optionId !== optionId),
		)
	}

	// Collapsing back to shared applies one level to every existing pick
	// again, same as the split->shared transition in the multiselect
	// mockup's own JS - otherwise switching modes would silently leave
	// whatever per-pick values were set in split mode in place, even though
	// the UI no longer shows them as independent.
	function setSharedMode() {
		setConvictionMode("shared")
		form.setValue(
			"selections",
			form
				.values()
				.selections.map((s) => ({ ...s, conviction: sharedConviction })),
		)
	}

	function updateSharedConviction(v: number) {
		setSharedConviction(v)
		form.setValue(
			"selections",
			form.values().selections.map((s) => ({ ...s, conviction: v })),
		)
	}

	const toleranceBand =
		question.numericTolerancePct !== null && guessValue
			? Math.round(Math.abs(guessValue * question.numericTolerancePct))
			: null

	return (
		<form onSubmit={form.handleSubmit}>
			<VStack gap="4" alignItems="stretch">
				{(type === "multiple_choice" ||
					type === "yes_no" ||
					type === "over_under") && (
					<VStack gap="2" alignItems="stretch">
						{question.options.map((option) => (
							<OptionRow
								key={option.id}
								label={
									type === "over_under" && question.ouLine !== null
										? `${option.label} ${question.ouLine}`
										: option.label
								}
								fieldPct={option.fieldPct}
								selected={selections.some((s) => s.optionId === option.id)}
								onClick={() => selectSingle(option.id)}
							/>
						))}
						<VStack gap="1.5" alignItems="stretch">
							<HStack justify="space-between">
								<FieldLabel>Conviction</FieldLabel>
								<span className={css({ fontFamily: "mono", fontSize: "xs" })}>
									{singleSelectConviction}%
								</span>
							</HStack>
							<Slider
								value={singleSelectConviction}
								onChange={(v) => {
									setSingleSelectConviction(v)
									if (selections[0]) {
										form.setValue("selections.0.conviction", v)
									}
								}}
								aria-label="Conviction"
							/>
						</VStack>
					</VStack>
				)}

				{type === "multi_select" && (
					<VStack gap="3" alignItems="stretch">
						<HStack justify="space-between">
							<FieldLabel required>
								Make your {question.picksRequired} picks
							</FieldLabel>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									color: "fg.subtle",
								})}
							>
								{selections.length} / {question.picksRequired}
							</span>
						</HStack>

						<EntitySearchField
							value={multiSelectSearch}
							onValueChange={setMultiSelectSearch}
							items={question.options
								.filter(
									(option) => !selections.some((s) => s.optionId === option.id),
								)
								.map(
									(option): EntitySearchItem => ({
										id: option.id,
										label: option.label,
										kind: "player",
										meta:
											option.fieldPct !== null
												? `${Math.round(option.fieldPct)}%`
												: undefined,
									}),
								)}
							placeholder="Search to add…"
							onSelectItem={(item) => addMultiSelectPick(item.id)}
						/>

						{selections.length > 0 && (
							<VStack gap="2" alignItems="stretch">
								{selections.map((selection, index) => {
									const option = question.options.find(
										(o) => o.id === selection.optionId,
									)
									if (!option) return null
									return (
										<VStack
											key={selection.optionId}
											gap="1.5"
											alignItems="stretch"
											className={css({
												background: "bg.surface",
												border: "1px solid",
												borderColor: "border.default",
												borderRadius: "md",
												padding: "3",
											})}
										>
											<HStack justify="space-between" gap="2">
												<span
													className={css({
														fontSize: "sm",
														fontWeight: "medium",
													})}
												>
													{option.label}
												</span>
												<HStack gap="2" alignItems="center">
													{option.fieldPct !== null && (
														<span
															className={css({
																fontFamily: "mono",
																fontSize: "2xs",
																color: "fg.subtle",
															})}
														>
															{Math.round(option.fieldPct)}% of the field has
															them
														</span>
													)}
													<button
														type="button"
														aria-label={`Remove ${option.label}`}
														onClick={() => removeMultiSelectPick(option.id)}
														className={css({
															display: "flex",
															alignItems: "center",
															justifyContent: "center",
															width: "6",
															height: "6",
															flexShrink: "0",
															borderRadius: "sm",
															color: "fg.subtle",
															cursor: "pointer",
															_hover: { color: "danger.default" },
														})}
													>
														<FiX size={13} />
													</button>
												</HStack>
											</HStack>
											{convictionMode === "split" && (
												<HStack gap="2" alignItems="center">
													<Slider
														value={selection.conviction}
														onChange={(v) =>
															form.setValue(`selections.${index}.conviction`, v)
														}
														aria-label={`Conviction for ${option.label}`}
													/>
													<span
														className={css({
															fontFamily: "mono",
															fontSize: "xs",
															flexShrink: "0",
														})}
													>
														{selection.conviction}%
													</span>
												</HStack>
											)}
										</VStack>
									)
								})}
							</VStack>
						)}

						<HStack justify="space-between">
							<FieldLabel>Conviction</FieldLabel>
							<HStack gap="1">
								{(["shared", "split"] as const).map((mode) => (
									<button
										key={mode}
										type="button"
										onClick={
											mode === "shared"
												? setSharedMode
												: () => setConvictionMode("split")
										}
										className={cx(
											css({
												fontFamily: "mono",
												fontSize: "2xs",
												letterSpacing: "wide",
												color: "fg.subtle",
												border: "1px solid",
												borderColor: "border.default",
												borderRadius: "sm",
												padding: "{spacing.1} {spacing.2}",
												cursor: "pointer",
											}),
											convictionMode === mode &&
												css({
													color: "fg.default",
													borderColor: "border.emphasized",
												}),
										)}
									>
										{mode === "shared" ? "One for all" : "Per pick"}
									</button>
								))}
							</HStack>
						</HStack>
						{convictionMode === "shared" && (
							<VStack gap="1.5" alignItems="stretch">
								<HStack justify="space-between">
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "2xs",
											color: "fg.subtle",
										})}
									>
										How much to commit
									</span>
									<span className={css({ fontFamily: "mono", fontSize: "xs" })}>
										{sharedConviction}%
									</span>
								</HStack>
								<Slider
									value={sharedConviction}
									onChange={updateSharedConviction}
									aria-label="Conviction for all picks"
								/>
							</VStack>
						)}
					</VStack>
				)}

				{type === "numeric_guess" && (
					<VStack gap="4" alignItems="stretch">
						<div className={css({ width: "40" })}>
							<form.Field name="guessValue">
								{(field) => (
									<TextInput error={field.meta.error ?? undefined}>
										<TextInput.Label required>Your guess</TextInput.Label>
										<TextInput.Group>
											<TextInput.Field
												type="number"
												value={field.value ?? ""}
												onChange={(e) =>
													field.onChange(
														e.target.value === ""
															? undefined
															: Number(e.target.value),
													)
												}
												onBlur={field.onBlur}
											/>
										</TextInput.Group>
									</TextInput>
								)}
							</form.Field>
						</div>
						{toleranceBand !== null && (
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									color: "success.default",
								})}
							>
								counts as a hit if the actual lands within ±{toleranceBand} of
								this
							</span>
						)}
						<form.Field name="conviction">
							{(field) => (
								<VStack gap="1.5" alignItems="stretch">
									<HStack justify="space-between">
										<FieldLabel required>Conviction</FieldLabel>
										<span
											className={css({ fontFamily: "mono", fontSize: "xs" })}
										>
											{field.value}%
										</span>
									</HStack>
									<Slider
										value={field.value ?? 50}
										onChange={field.onChange}
										aria-label="Conviction"
									/>
								</VStack>
							)}
						</form.Field>
					</VStack>
				)}

				<form.Field name="caseText">
					{(field) => (
						<Textarea error={field.meta.error ?? undefined}>
							<Textarea.Label>Make your case (optional)</Textarea.Label>
							<Textarea.Field
								placeholder="Why this call?"
								maxLength={600}
								value={field.value}
								onChange={field.onChange}
								onBlur={field.onBlur}
							/>
						</Textarea>
					)}
				</form.Field>

				<form.Subscribe selector={(s) => s.meta}>
					{(meta) => (
						<VStack gap="2" alignItems="stretch">
							<Button
								type="submit"
								variant="solid"
								size="lg"
								fullWidth
								loading={meta.isSubmitting}
								disabled={meta.isSubmitting || !meta.canSubmit}
							>
								Lock In Your Call
							</Button>
							<FormError message={meta.formError} />
						</VStack>
					)}
				</form.Subscribe>
			</VStack>
		</form>
	)
}
