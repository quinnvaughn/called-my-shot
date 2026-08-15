import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import type { StatsBySportQuery } from "#/graphql/generated/graphql"
import { ChipButton } from "./chip-button"
import type { EntitySearchItem } from "./entity-search-field"
import { EntitySearchField } from "./entity-search-field"
import type { CreateQuestionFormApi } from "./form-types"

type Stat = StatsBySportQuery["stats"][number]

type Props = {
	form: CreateQuestionFormApi
	stats: Stat[]
}

const QUICK_PICK_COUNT = 8

// Backed by the real, sport-scoped `stats` catalog: quick chips for the top
// stats (already sortOrder-ranked by the query), a search field for the rest
// of the catalog, and a freeform fallback (customStat) for anything not in
// it yet - that gap is a seed-data/admin-console problem to solve later, not
// something this picker routes around.
export function StatPicker({ form, stats }: Props) {
	const statId = form.useWatch("statId")
	const quickPicks = stats.slice(0, QUICK_PICK_COUNT)
	const items: EntitySearchItem[] = stats.map((stat) => ({
		id: stat.id,
		label: stat.name,
		kind: "stat",
		meta: stat.category,
	}))

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
			<form.Field name="customStat">
				{(field) => (
					<EntitySearchField
						value={
							statId
								? (stats.find((s) => s.id === statId)?.name ?? "")
								: field.value
						}
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
			<FieldHint>
				This is what gets checked against the box score at resolution - pick
				from the catalog when you can, or type a name for anything not in it
				yet.
			</FieldHint>
		</VStack>
	)
}
