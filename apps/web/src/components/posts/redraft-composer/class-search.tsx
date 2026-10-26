import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FiSearch } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Tabs } from "#/components/ui/tabs"
import { TextInput } from "#/components/ui/text-input"
import {
	redraftClassesQuery,
	rushmoreLeaguesQuery,
} from "#/graphql/posts/composer-queries"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { choiceList, listLabel } from "../rushmore-composer/composer-styles"
import { ClassRow } from "./class-row"

const ALL = "all"

// Step one: which draft class. Pills pick the league (or all of them), and
// the box narrows by year or a player, who finds the class they came out of.
// Before anything is typed, the newest classes.
export function ClassSearch({
	onChoose,
}: {
	onChoose: (code: string) => void
}) {
	const [league, setLeague] = useState(ALL)
	const [text, setText] = useState("")
	const query = useDebouncedValue(text.trim(), 250)
	const { data: leaguesData } = useQuery(rushmoreLeaguesQuery)
	const leagues = (leaguesData?.leagues ?? []).filter(
		(l) => l.status === "ACTIVE",
	)
	const leagueId = league === ALL ? null : league
	const { data, isPending } = useQuery({
		...redraftClassesQuery(leagueId, query),
		placeholderData: keepPreviousData,
	})
	const classes = data?.redraftClasses ?? []

	return (
		<VStack gap="4" alignItems="stretch">
			<Tabs value={league} onValueChange={setLeague}>
				<Tabs.List variant="pill" aria-label="League">
					<Tabs.Trigger value={ALL}>All</Tabs.Trigger>
					{leagues.map((l) => (
						<Tabs.Trigger key={l.id} value={l.id}>
							{l.abbreviation}
						</Tabs.Trigger>
					))}
				</Tabs.List>
			</Tabs>
			<TextInput>
				<TextInput.Group>
					<TextInput.Icon>
						<FiSearch size={16} />
					</TextInput.Icon>
					<TextInput.Field
						type="search"
						autoComplete="off"
						aria-label="Search draft classes"
						placeholder="A year or a player: 2003, LeBron"
						value={text}
						onChange={(event) => setText(event.target.value)}
					/>
				</TextInput.Group>
			</TextInput>
			{!isPending && classes.length === 0 ? (
				<p className={css({ fontSize: "sm", color: "fg.muted" })}>
					No draft class matches that. Try a year or a player's name.
				</p>
			) : (
				<VStack gap="1.5" alignItems="stretch">
					{!query && <span className={listLabel}>Newest classes</span>}
					<div className={choiceList}>
						{classes.map((draftClass) => (
							<ClassRow
								key={draftClass.id}
								draftClass={draftClass}
								onChoose={onChoose}
							/>
						))}
					</div>
				</VStack>
			)}
		</VStack>
	)
}
