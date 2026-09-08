import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { DateTime } from "luxon"
import { useEffect, useRef, useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Combobox } from "#/components/ui/combobox"
import { DATE_TIME_PICKER_VALUE_FORMAT } from "#/components/ui/date-time-picker"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import { TextInput } from "#/components/ui/text-input"
import type { GameByIdQuery } from "#/graphql/generated/graphql"
import { GamesByLeagueDocument } from "#/graphql/queries/sports"
import { gqlQueryOptions } from "#/graphql/query-options"
import { GameBlock } from "../game-block"
import { useSetValue, useWatch } from "./form-context"

type Props = {
	leagueId: string
	// Lifted to the parent form (not fetched here) - a picked game also
	// narrows the subject/option team-player pickers elsewhere in the form,
	// so the parent needs this same data anyway. Passed down rather than
	// queried twice so there's one source of truth for "what game is this".
	selectedGame: GameByIdQuery["game"]
	// game_total_over_under, team_vs_team, player_stat_numeric_guess, and
	// team_stat_numeric_guess are inherently about one specific game (an
	// exact-number guess has no season-total reading the way an over/under
	// line does) - only changes the label/hint copy below, the schema itself
	// is what actually enforces the requirement.
	required?: boolean
}

const DEBOUNCE_MS = 250

// Optional link from a question to the single real-world game it's about
// (see gameId on the questions table) - server-side searched rather than
// client-filtered like EntitySearchField's teams/players, since a league's
// full slate of games can run much larger than its roster. Picking a game
// also fills and locks the Resolution section's locksAt field (see
// resolution-fields.tsx) to that game's own kickoff.
export function GameField({ leagueId, selectedGame, required }: Props) {
	const gameId = useWatch("gameId")
	const setValue = useSetValue()
	const [inputText, setInputText] = useState("")
	const [open, setOpen] = useState(false)
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
	const [debouncedQuery, setDebouncedQuery] = useState("")

	useEffect(() => {
		const id = setTimeout(
			() => setDebouncedQuery(inputText.trim()),
			DEBOUNCE_MS,
		)
		return () => clearTimeout(id)
	}, [inputText])

	// A league change invalidates whatever game was picked under the old one
	// (the API resolver rejects a cross-league gameId at submit time anyway) -
	// this just clears it proactively instead of leaving a stale selection.
	const prevLeagueId = useRef(leagueId)
	useEffect(() => {
		if (prevLeagueId.current !== leagueId) {
			prevLeagueId.current = leagueId
			if (gameId) {
				setValue("gameId", undefined)
				setValue("locksAt", "")
			}
		}
	}, [leagueId, gameId, setValue])

	const { data: searchData } = useQuery(
		gqlQueryOptions(
			GamesByLeagueDocument,
			{ leagueId, query: debouncedQuery || undefined },
			{
				enabled: !!leagueId && !gameId,
				placeholderData: keepPreviousData,
			},
		),
	)

	const games = searchData?.games ?? []

	function selectGame(game: (typeof games)[number]) {
		setValue("gameId", game.id)
		setValue(
			"locksAt",
			DateTime.fromISO(game.startsAt).toFormat(DATE_TIME_PICKER_VALUE_FORMAT),
		)
		setInputText("")
		setOpen(false)
		setHighlightedKey(null)
	}

	function clearGame() {
		setValue("gameId", undefined)
		setValue("locksAt", "")
		setInputText("")
	}

	return (
		<VStack gap="1.5" alignItems="stretch">
			<FieldLabel required={required}>Game</FieldLabel>
			{selectedGame ? (
				<VStack gap="1.5" alignItems="stretch">
					<GameBlock game={selectedGame} />
					<button
						type="button"
						onClick={clearGame}
						className={css({
							alignSelf: "flex-start",
							fontSize: "xs",
							color: "fg.subtle",
							textDecoration: "underline",
							cursor: "pointer",
						})}
					>
						Change game
					</button>
				</VStack>
			) : leagueId ? (
				<div>
					<TextInput>
						<TextInput.Group>
							<TextInput.Field
								placeholder="Search this league's upcoming games…"
								autoComplete="off"
								value={inputText}
								onChange={(event) => {
									setInputText(event.target.value)
									setHighlightedKey(null)
									setOpen(true)
								}}
								onFocus={() => setOpen(true)}
								onBlur={() => {
									// Let a dropdown click register before the blur closes it.
									setTimeout(() => setOpen(false), 150)
								}}
							/>
						</TextInput.Group>
					</TextInput>
					<Combobox
						open={open && games.length > 0}
						highlightedKey={highlightedKey}
						onHighlightChange={setHighlightedKey}
						onSelect={(key) => {
							const game = games.find((g) => g.id === key)
							if (game) selectGame(game)
						}}
					>
						{games.map((game) => (
							<Combobox.Option
								key={game.id}
								optionKey={game.id}
								meta={DateTime.fromISO(game.startsAt).toFormat("MMM d, h:mm a")}
							>
								{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
							</Combobox.Option>
						))}
					</Combobox>
				</div>
			) : (
				<FieldHint>Pick a league above to search its games.</FieldHint>
			)}
			<FieldHint>
				{required
					? "Required for this shape - its kickoff becomes the lock time below."
					: "Optional - pick the real-world game this is about and its kickoff becomes the lock time below. Leave blank for anything not scoped to one game (season awards, an MVP race)."}
			</FieldHint>
		</VStack>
	)
}
