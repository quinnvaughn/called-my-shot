import { FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { FieldHint } from "#/components/ui/field-hint"
import { FormError } from "#/components/ui/form-error"
import type { EntitySearchItem } from "./entity-search-field"
import { EntitySearchField } from "./entity-search-field"
import type { CreateQuestionFormApi } from "./form-types"

type Props = {
	form: CreateQuestionFormApi
	// null = no fixed vocabulary to search against - rows fall back to plain
	// freeform labels with no suggestions.
	items: EntitySearchItem[] | null
	rowPlaceholder: string
	addLabel: string
	// player_vs_player only - exactly 2 slots, pre-seeded by the caller (see
	// selectType in create-question-form.tsx) and neither addable nor
	// removable here, unlike player_award_finalists' open-ended list.
	exactCount?: number
}

// A manually curated list - player_award_finalists' real announced
// shortlist (2+ named players, admin-entered) and player_vs_player's fixed
// 2 slots. player_season_award/team_season_award use PoolSummary instead
// (the full league roster, auto-derived, no per-row editing) - see
// create-question-form.tsx.
export function OptionList({
	form,
	items,
	rowPlaceholder,
	addLabel,
	exactCount,
}: Props) {
	return (
		<form.FieldArray name="options">
			{({ items: rows, helpers, meta }) => {
				return (
					<VStack gap="2" alignItems="stretch">
						<FieldHint>
							{items === null
								? "No fixed vocabulary - type any option freely."
								: "Search to pick a real team or player - free text options won't be accepted."}
						</FieldHint>
						{rows.map((row) => (
							<HStack key={row.id} gap="2" alignItems="flex-start">
								<div className={css({ flex: "1" })}>
									<form.Field name={`options.${row.index}.label`}>
										{(field) => (
											<EntitySearchField
												value={field.value ?? ""}
												onValueChange={(text) => {
													field.onChange(text)
													// A hand-edited label no longer matches whatever
													// team/player it might have been picked from.
													form.setValue(
														`options.${row.index}.teamId`,
														undefined,
													)
													form.setValue(
														`options.${row.index}.playerId`,
														undefined,
													)
												}}
												items={items}
												placeholder={rowPlaceholder}
												error={field.meta.error ?? undefined}
												onSelectItem={(item) => {
													form.setValue(
														`options.${row.index}.label`,
														item.label,
													)
													form.setValue(
														`options.${row.index}.teamId`,
														item.kind === "team" ? item.id : undefined,
													)
													form.setValue(
														`options.${row.index}.playerId`,
														item.kind === "player" ? item.id : undefined,
													)
												}}
											/>
										)}
									</form.Field>
								</div>
								{exactCount === undefined && (
									<button
										type="button"
										aria-label="Remove option"
										onClick={() => helpers.remove(row.index)}
										className={css({
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											width: "9",
											height: "9",
											flexShrink: 0,
											borderRadius: "lg",
											color: "fg.subtle",
											_hover: { color: "danger.default", bg: "bg.subtle" },
										})}
									>
										<FiX size={15} />
									</button>
								)}
							</HStack>
						))}
						<FormError message={meta.touched ? meta.error : null} />
						{exactCount === undefined && (
							<button
								type="button"
								onClick={() => helpers.push({ label: "" })}
								className={css({
									width: "100%",
									textAlign: "center",
									fontFamily: "mono",
									fontSize: "xs",
									letterSpacing: "wide",
									color: "fg.subtle",
									border: "1px dashed",
									borderColor: "border.default",
									borderRadius: "lg",
									padding: "2.5",
									_hover: {
										borderColor: "border.emphasized",
										color: "fg.body",
									},
								})}
							>
								{addLabel}
							</button>
						)}
					</VStack>
				)
			}}
		</form.FieldArray>
	)
}
