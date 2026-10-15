import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { FieldLabel } from "#/components/ui/field-label"
import { useQuestionData } from "./data-context"
import type { EntitySearchItem } from "./entity-search-field"
import { EntitySearchField } from "./entity-search-field"
import { useFormValues, useSetValue, useWatch } from "./form-context"

// A single autocomplete over every league across every sport, rather than a
// sport picker that then filters a league picker - with two sports total
// right now, a cascading two-step picker is more clicks than the choice is
// worth. Picking a league sets sportId too (derived from the league's own
// parent sport), since the form still needs both for the question row.
export function LeagueField() {
	const { sports, lockedBallotId } = useQuestionData("LeagueField")
	const leagueId = useWatch("leagueId")
	const setValue = useSetValue()
	const getValues = useFormValues()
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

	// A game, ballot or award division picked under the old league doesn't
	// belong to the new one (the server rejects a cross-league game or ballot
	// at submit time anyway), so a league change clears them rather than
	// leaving a stale selection. A locked ballot (arrived via ?ballotId=) is
	// fixed context and stays whatever the league field shows.
	function setLeague(next: { leagueId: string; sportId: string }) {
		const { gameId, ballot, awardDivisions } = getValues()
		const changed = next.leagueId !== leagueId
		setValue("leagueId", next.leagueId)
		setValue("sportId", next.sportId)
		if (!changed) return
		if (gameId) {
			setValue("gameId", undefined)
			setValue("locksAt", "")
		}
		if (ballot && !lockedBallotId) setValue("ballot", undefined)
		if (awardDivisions.length > 0) setValue("awardDivisions", [])
	}

	return (
		<VStack gap="1.5" alignItems="stretch" data-field="league">
			<FieldLabel required>League</FieldLabel>
			<EntitySearchField
				value={inputText || (selected?.name ?? "")}
				onValueChange={(text) => {
					setInputText(text)
					setLeague({ leagueId: "", sportId: "" })
				}}
				items={items}
				placeholder="Search leagues…"
				required
				onSelectItem={(item) => {
					const league = leagues.find((l) => l.id === item.id)
					if (!league) return
					setInputText(league.name)
					setLeague({ leagueId: league.id, sportId: league.sportId })
				}}
			/>
		</VStack>
	)
}
