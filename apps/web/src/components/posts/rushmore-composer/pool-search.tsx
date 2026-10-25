import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FiSearch } from "react-icons/fi"
import { Combobox } from "#/components/ui/combobox"
import { PlayerHeadshot } from "#/components/ui/player-headshot"
import { TextInput } from "#/components/ui/text-input"
import { rushmorePoolQuery } from "#/graphql/posts/composer-queries"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { type PoolEntry, poolYears } from "./types"

type Props = {
	promptId: string
	// Players already on the Rushmore, left out of the results.
	pickedIds: string[]
	// How many picks are still open. At zero the box is disabled.
	room: number
	onPick: (entry: PoolEntry) => void
}

// Finds players for the Rushmore by name. Before anything is typed it lists
// the best-known players the prompt allows, so the obvious picks are a tap
// away.
export function PoolSearch({ promptId, pickedIds, room, onPick }: Props) {
	const [text, setText] = useState("")
	const [open, setOpen] = useState(false)
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
	const debounced = useDebouncedValue(text.trim(), 250)
	const { data } = useQuery({
		...rushmorePoolQuery(promptId, debounced),
		enabled: room > 0,
		placeholderData: keepPreviousData,
	})
	const results = (data?.rushmorePool ?? []).filter(
		(entry) => !pickedIds.includes(entry.player.id),
	)

	function pick(entry: PoolEntry) {
		onPick(entry)
		setText("")
		setHighlightedKey(null)
		setOpen(false)
	}

	return (
		<div>
			<TextInput
				description={
					room > 0 ? undefined : "That's four. Remove one to pick someone else."
				}
			>
				<TextInput.Label>
					{room > 0 ? `Add a player (${room} more to pick)` : "Add a player"}
				</TextInput.Label>
				<TextInput.Group>
					<TextInput.Icon>
						<FiSearch size={16} />
					</TextInput.Icon>
					<TextInput.Field
						autoComplete="off"
						placeholder="Search by name"
						disabled={room === 0}
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
									(entry) => entry.player.id === highlightedKey,
								)
								pick(highlighted ?? results[0])
							}
						}}
					/>
				</TextInput.Group>
			</TextInput>
			<Combobox
				open={open && room > 0}
				highlightedKey={highlightedKey}
				onHighlightChange={setHighlightedKey}
				onSelect={(key) => {
					const entry = results.find((e) => e.player.id === key)
					if (entry) pick(entry)
				}}
			>
				{results.length === 0 ? (
					<Combobox.Empty>
						{debounced
							? "Nobody by that name can be picked for this prompt."
							: "Loading players"}
					</Combobox.Empty>
				) : (
					results.map((entry) => (
						<Combobox.Option
							key={entry.player.id}
							optionKey={entry.player.id}
							icon={
								<PlayerHeadshot
									name={entry.player.name}
									src={entry.player.headshotUrl}
								/>
							}
							meta={`${poolYears(entry)}${entry.hallOfFame ? " · Hall of Fame" : ""}`}
						>
							{entry.player.name}
						</Combobox.Option>
					))
				)}
			</Combobox>
		</div>
	)
}
