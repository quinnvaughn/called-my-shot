import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import type { StatsBySportQuery } from "#/graphql/generated/graphql"
import { ChipButton } from "#/components/ui/chip-button"
import type { EntitySearchItem } from "./entity-search-field"
import { EntitySearchField } from "./entity-search-field"
import type { CreateQuestionFormApi } from "./form-types"

type Stat = StatsBySportQuery["stats"][number]

type Props = {
	form: CreateQuestionFormApi
	stats: Stat[]
	// numeric_guess only - its tolerance band comes from the picked stat's own
	// tolerance tier (see create-question's resolver), so unlike over_under a
	// freeform stat has nowhere to pull a band from. No "type your own"
	// fallback for this type - catalog stats only.
	catalogOnly?: boolean
}

const QUICK_PICK_COUNT = 8

// Backed by the real, sport-scoped `stats` catalog: quick chips for the top
// stats (already sortOrder-ranked by the query), plus a search field for the
// rest of the catalog. over_under also allows a freeform fallback
// (customStat) for anything not in the catalog yet; numeric_guess doesn't
// (see catalogOnly).
export function StatPicker({ form, stats, catalogOnly }: Props) {
	const statId = form.useWatch("statId")
	const [searchText, setSearchText] = useState("")
	const quickPicks = stats.slice(0, QUICK_PICK_COUNT)
	const items: EntitySearchItem[] = stats.map((stat) => ({
		id: stat.id,
		label: stat.name,
		kind: "stat",
		meta: stat.category,
	}))
	const selectedStatName = statId
		? (stats.find((s) => s.id === statId)?.name ?? "")
		: null

	return (
		<VStack gap="2.5" alignItems="stretch">
			<FieldLabel required>Stat</FieldLabel>
			{quickPicks.length > 0 && (
				<div className={css({ display: "flex", flexWrap: "wrap", gap: "1.5" })}>
					{quickPicks.map((stat) => (
						<ChipButton
							key={stat.id}
							selected={stat.id === statId}
							onClick={() => {
								form.setValue("statId", stat.id)
								form.setValue("customStat", "")
							}}
						>
							{stat.name}
						</ChipButton>
					))}
				</div>
			)}
			{catalogOnly ? (
				<form.Field name="statId">
					{(field) => (
						<EntitySearchField
							value={selectedStatName ?? searchText}
							onValueChange={setSearchText}
							items={items}
							placeholder="Search stats…"
							required
							error={field.meta.error ?? undefined}
							onSelectItem={(item) => {
								form.setValue("statId", item.id)
								setSearchText("")
							}}
						/>
					)}
				</form.Field>
			) : (
				<form.Field name="customStat">
					{(field) => (
						<EntitySearchField
							value={selectedStatName ?? field.value}
							onValueChange={(text) => {
								form.setValue("statId", undefined)
								field.onChange(text)
							}}
							items={items}
							placeholder="Search stats or type your own…"
							required
							error={field.meta.error ?? undefined}
							onSelectItem={(item) => {
								form.setValue("statId", item.id)
								field.onChange("")
							}}
						/>
					)}
				</form.Field>
			)}
			<FieldHint>
				{catalogOnly
					? "This is what gets checked against the box score at resolution - only stats already in the catalog, since each one carries its own scoring tolerance."
					: "This is what gets checked against the box score at resolution - pick from the catalog when you can, or type a name for anything not in it yet."}
			</FieldHint>
		</VStack>
	)
}
