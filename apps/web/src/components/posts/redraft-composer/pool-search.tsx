import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FiSearch } from "react-icons/fi"
import { Combobox } from "#/components/ui/combobox"
import { PlayerHeadshot } from "#/components/ui/player-headshot"
import { TextInput } from "#/components/ui/text-input"
import { redraftPoolQuery } from "#/graphql/posts/composer-queries"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { careerYears, draftedAt, type RedraftPoolEntry } from "./types"

type Props = {
	promptId: string
	// Players already in a slot, left out of the results.
	pickedIds: string[]
	// The slot the next pick goes in, and the team that held it. Null once
	// every slot is filled, which disables the box.
	target: { slot: number; teamName: string | null } | null
	onPick: (entry: RedraftPoolEntry) => void
}

// Finds players from the class by name. Before anything is typed it lists
// the class's best careers, so the obvious picks are a tap away.
export function PoolSearch({ promptId, pickedIds, target, onPick }: Props) {
	const [text, setText] = useState("")
	const [open, setOpen] = useState(false)
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
	const debounced = useDebouncedValue(text.trim(), 250)
	const { data } = useQuery({
		...redraftPoolQuery(promptId, debounced),
		enabled: target !== null,
		placeholderData: keepPreviousData,
	})
	const results = (data?.redraftPool ?? []).filter(
		(entry) => !pickedIds.includes(entry.player.id),
	)

	function pick(entry: RedraftPoolEntry) {
		onPick(entry)
		setText("")
		setHighlightedKey(null)
	}

	return (
		<div>
			<TextInput
				description={
					target
						? undefined
						: "Every slot is filled. Remove a pick to change it."
				}
			>
				<TextInput.Label>
					{target
						? `Pick #${target.slot}${target.teamName ? ` for the ${target.teamName}` : ""}`
						: "Add a player"}
				</TextInput.Label>
				<TextInput.Group>
					<TextInput.Icon>
						<FiSearch size={16} />
					</TextInput.Icon>
					<TextInput.Field
						autoComplete="off"
						placeholder="Search the class by name"
						disabled={target === null}
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
				open={open && target !== null}
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
							? "Nobody by that name is in this class."
							: "Loading the class"}
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
							meta={[
								draftedAt(entry.overall),
								careerYears(entry),
								entry.hallOfFame ? "Hall of Fame" : "",
							]
								.filter(Boolean)
								.join(" · ")}
						>
							{entry.player.name}
						</Combobox.Option>
					))
				)}
			</Combobox>
		</div>
	)
}
