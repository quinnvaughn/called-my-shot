import { FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import { FormError } from "#/components/ui/form-error"
import type { EntitySearchItem } from "./entity-search-field"
import { EntitySearchField } from "./entity-search-field"
import { Field, FieldArray, useSetValue } from "./form-context"

type Props = {
	// null = no fixed vocabulary to search against - rows fall back to plain
	// freeform labels with no suggestions.
	items: EntitySearchItem[] | null
	rowPlaceholder: string
	addLabel: string
	// player_vs_player only - exactly 2 slots, pre-seeded by the caller (see
	// selectType in create-question-form.tsx) and neither addable nor
	// removable here, unlike player_award_finalists' open-ended list.
	exactCount?: number
	// A fixed-size list (exactCount set) reads as "two named slots", not an
	// open pool - labeling them ("Player A"/"Player B") makes that fixed
	// identity visible instead of two identical-looking search fields with no
	// visual distinction. Only meaningful alongside exactCount; an open-ended
	// pool (player_award_finalists) doesn't have named slots to label.
	rowLabels?: string[]
}

// A manually curated list - player_award_finalists' real announced
// shortlist (2+ named players, admin-entered) and player_vs_player's fixed
// 2 slots. player_season_award/team_season_award use PoolSummary instead
// (the full league roster, auto-derived, no per-row editing) - see
// create-question-form.tsx.
export function OptionList({
	items,
	rowPlaceholder,
	addLabel,
	exactCount,
	rowLabels,
}: Props) {
	const setValue = useSetValue()
	return (
		<FieldArray name="options">
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
								<VStack
									gap="1.5"
									alignItems="stretch"
									className={css({ flex: "1" })}
								>
									{rowLabels?.[row.index] && (
										<FieldLabel required>{rowLabels[row.index]}</FieldLabel>
									)}
									<Field name={`options.${row.index}.label`}>
										{(field) => (
											<EntitySearchField
												value={field.value ?? ""}
												onValueChange={(text) => {
													field.onChange(text)
													// A hand-edited label no longer matches whatever
													// team/player it might have been picked from.
													setValue(`options.${row.index}.teamId`, undefined)
													setValue(`options.${row.index}.playerId`, undefined)
												}}
												items={items}
												placeholder={rowPlaceholder}
												error={field.meta.error ?? undefined}
												onSelectItem={(item) => {
													setValue(`options.${row.index}.label`, item.label)
													setValue(
														`options.${row.index}.teamId`,
														item.kind === "team" ? item.id : undefined,
													)
													setValue(
														`options.${row.index}.playerId`,
														item.kind === "player" ? item.id : undefined,
													)
												}}
											/>
										)}
									</Field>
								</VStack>
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
									cursor: "pointer",
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
		</FieldArray>
	)
}
