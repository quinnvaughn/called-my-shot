import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { FieldLabel } from "#/components/ui/field-label"
import type { SportsQuery } from "#/graphql/generated/graphql"
import type { EntitySearchItem } from "./entity-search-field"
import { EntitySearchField } from "./entity-search-field"
import { useSetValue, useWatch } from "./form-context"

type Props = {
	sports: SportsQuery["sports"]
}

// A single autocomplete over every league across every sport, rather than a
// sport picker that then filters a league picker - with two sports total
// right now, a cascading two-step picker is more clicks than the choice is
// worth. Picking a league sets sportId too (derived from the league's own
// parent sport), since the form still needs both for the question row.
export function LeagueField({ sports }: Props) {
	const leagueId = useWatch("leagueId")
	const setValue = useSetValue()
	const [inputText, setInputText] = useState("")

	const leagues = sports.flatMap((sport) =>
		sport.leagues.map((league) => ({ ...league, sportId: sport.id })),
	)
	const selected = leagues.find((league) => league.id === leagueId)
	const items: EntitySearchItem[] = leagues.map((league) => ({
		id: league.id,
		label: league.name,
		kind: "league" as const,
		meta: league.abbreviation,
	}))

	return (
		<VStack gap="1.5" alignItems="stretch" data-field="league">
			<FieldLabel required>League</FieldLabel>
			<EntitySearchField
				value={inputText || (selected?.name ?? "")}
				onValueChange={(text) => {
					setInputText(text)
					setValue("leagueId", "")
					setValue("sportId", "")
				}}
				items={items}
				placeholder="Search leagues…"
				required
				onSelectItem={(item) => {
					const league = leagues.find((l) => l.id === item.id)
					if (!league) return
					setInputText(league.name)
					setValue("leagueId", league.id)
					setValue("sportId", league.sportId)
				}}
			/>
		</VStack>
	)
}
