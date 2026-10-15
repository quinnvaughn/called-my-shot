import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { ChipButton } from "#/components/ui/chip-button"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import type { StatsBySportQuery } from "#/graphql/generated/graphql"
import type { EntitySearchItem } from "./entity-search-field"
import { EntitySearchField } from "./entity-search-field"
import { Field, useFormValues, useSetValue, useWatch } from "./form-context"
import { offersStatAggregationFor } from "./stat-aggregation"

type Stat = StatsBySportQuery["stats"][number]

type Props = {
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
export function StatPicker({ stats, catalogOnly }: Props) {
	const statId = useWatch("statId")
	const setValue = useSetValue()
	const getValues = useFormValues()
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

	// What was set for the old stat doesn't carry over to a different one. A
	// line belongs to the stat it was set for: 24.5 is a fair Points line and a
	// nonsense Batting Average one, and ouLine only rejects whole numbers, so a
	// stale line would still publish. Dropping it re-exposes the placeholder
	// for the new stat. An aggregation picked for Points would likewise still
	// submit, and put "per game" in the title, after a switch to a stat that
	// doesn't offer one.
	function changeStat(next: {
		statId: string | undefined
		customStat?: string
	}) {
		const prev = getValues()
		const nextCustomStat = next.customStat ?? prev.customStat
		setValue("statId", next.statId)
		if (next.customStat !== undefined) setValue("customStat", next.customStat)
		if (
			prev.ouLine !== undefined &&
			(prev.statId ?? prev.customStat) !== (next.statId ?? nextCustomStat)
		) {
			setValue("ouLine", undefined)
		}
		const nextStat = next.statId
			? stats.find((stat) => stat.id === next.statId)
			: undefined
		if (
			prev.statAggregation &&
			prev.shape === "player_season_stat_leader" &&
			!offersStatAggregationFor(prev.shape, nextStat)
		) {
			setValue("statAggregation", undefined)
		}
	}

	return (
		<VStack gap="2.5" alignItems="stretch">
			<FieldLabel required>Stat</FieldLabel>
			{quickPicks.length > 0 && (
				<div className={css({ display: "flex", flexWrap: "wrap", gap: "1.5" })}>
					{quickPicks.map((stat) => (
						<ChipButton
							key={stat.id}
							selected={stat.id === statId}
							onClick={() => changeStat({ statId: stat.id, customStat: "" })}
						>
							{stat.name}
						</ChipButton>
					))}
				</div>
			)}
			{catalogOnly ? (
				<Field name="statId">
					{(field) => (
						<EntitySearchField
							value={selectedStatName ?? searchText}
							onValueChange={setSearchText}
							items={items}
							placeholder="Search stats…"
							required
							error={field.meta.error ?? undefined}
							onSelectItem={(item) => {
								changeStat({ statId: item.id })
								setSearchText("")
							}}
						/>
					)}
				</Field>
			) : (
				<Field name="customStat">
					{(field) => (
						<EntitySearchField
							value={selectedStatName ?? field.value}
							onValueChange={(text) =>
								changeStat({ statId: undefined, customStat: text })
							}
							items={items}
							placeholder="Search stats or type your own…"
							required
							error={field.meta.error ?? undefined}
							onSelectItem={(item) =>
								changeStat({ statId: item.id, customStat: "" })
							}
						/>
					)}
				</Field>
			)}
			<FieldHint>
				{catalogOnly
					? "This is what gets checked against the box score at resolution - only stats already in the catalog, since each one carries its own scoring tolerance."
					: "This is what gets checked against the box score at resolution - pick from the catalog when you can, or type a name for anything not in it yet."}
			</FieldHint>
		</VStack>
	)
}
