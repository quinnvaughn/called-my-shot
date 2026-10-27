import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FiSearch } from "react-icons/fi"
import { Combobox } from "#/components/ui/combobox"
import { PlayerHeadshot } from "#/components/ui/player-headshot"
import { TextInput } from "#/components/ui/text-input"
import type { TeammateChainPlayer_PlayerFragment } from "#/graphql/generated/graphql"
import { teammateChainPlayersQuery } from "#/graphql/teammate-chain/queries"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { chainPlayerYears } from "./chain-result"

const MIN_SEARCH = 2

// Finds the next player in the chain by name, anyone who played in the
// league. The list never hints at who fits: that's the game.
export function ChainPlayerSearch({
	puzzleId,
	lastName,
	excludeIds,
	full,
	disabled,
	onPick,
}: {
	puzzleId: string
	// The player the next pick has to have played with.
	lastName: string
	// The two ends and the chain so far, left out of the results.
	excludeIds: string[]
	// The chain holds as many players as it can: undo or give up.
	full: boolean
	disabled: boolean
	onPick: (player: TeammateChainPlayer_PlayerFragment) => void
}) {
	const [text, setText] = useState("")
	const [open, setOpen] = useState(false)
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
	const debounced = useDebouncedValue(text.trim(), 250)
	const { data } = useQuery({
		...teammateChainPlayersQuery(puzzleId, debounced),
		enabled: debounced.length >= MIN_SEARCH && !full,
		placeholderData: keepPreviousData,
	})
	const results =
		debounced.length >= MIN_SEARCH
			? (data?.teammateChainPlayers ?? []).filter(
					(p) => !excludeIds.includes(p.player.id),
				)
			: []

	function pick(player: TeammateChainPlayer_PlayerFragment) {
		onPick(player)
		setText("")
		setHighlightedKey(null)
		setOpen(false)
	}

	return (
		<div>
			<TextInput
				description={
					full
						? "Your chain is full. Take a player back or give up."
						: undefined
				}
			>
				<TextInput.Label>Who played with {lastName}?</TextInput.Label>
				<TextInput.Group>
					<TextInput.Icon>
						<FiSearch size={16} />
					</TextInput.Icon>
					<TextInput.Field
						autoComplete="off"
						placeholder="Search any player in the league"
						disabled={full || disabled}
						value={text}
						onChange={(event) => {
							setText(event.target.value)
							setHighlightedKey(null)
							setOpen(true)
						}}
						onFocus={() => setOpen(true)}
						onBlur={() => {
							// Let a dropdown click register before the blur closes it.
							setTimeout(() => setOpen(false), 150)
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" && results.length > 0) {
								event.preventDefault()
								const highlighted = results.find(
									(p) => p.player.id === highlightedKey,
								)
								pick(highlighted ?? results[0])
							}
						}}
					/>
				</TextInput.Group>
			</TextInput>
			<Combobox
				open={open && !full && debounced.length >= MIN_SEARCH}
				highlightedKey={highlightedKey}
				onHighlightChange={setHighlightedKey}
				onSelect={(key) => {
					const found = results.find((p) => p.player.id === key)
					if (found) pick(found)
				}}
			>
				{results.length === 0 ? (
					<Combobox.Empty>Nobody in the league by that name.</Combobox.Empty>
				) : (
					results.map((p) => (
						<Combobox.Option
							key={p.player.id}
							optionKey={p.player.id}
							icon={
								<PlayerHeadshot
									name={p.player.name}
									src={p.player.headshotUrl}
								/>
							}
							meta={
								[
									chainPlayerYears(p),
									[
										...new Set(p.teams.map((entry) => entry.team.abbreviation)),
									].join(", "),
								]
									.filter(Boolean)
									.join(" · ") || undefined
							}
						>
							{p.player.name}
						</Combobox.Option>
					))
				)}
			</Combobox>
		</div>
	)
}
