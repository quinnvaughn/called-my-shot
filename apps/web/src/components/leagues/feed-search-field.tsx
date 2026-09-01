import { useQuery } from "@apollo/client/react"
import { useEffect, useState } from "react"
import { Combobox } from "#/components/ui/combobox"
import { TextInput } from "#/components/ui/text-input"
import { TeamBadge } from "#/components/ui/team-badge"
import { LeagueSearchDocument } from "#/graphql/queries/sports"

type Team = { id: string; name: string; abbreviation: string; color: string }

export type SelectedTeam = { id: string; name: string }

type Props = {
	leagueId: string
	value: string
	onValueChange: (text: string) => void
	onSelectTeam: (team: SelectedTeam) => void
	placeholder?: string
}

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2

// Same server-side, per-keystroke, bounded lookup the old cross-league home
// feed's search bar used (see LeagueSearchDocument's comment) - scoped to
// one league instead of site-wide. Selecting a team sets the precise teamId
// filter feed.tsx passes to LeagueFeedDocument; selecting a player just
// fills the box with their name, since `questions` has no playerId filter
// to select into - the substring `search` fallback covers it.
export function FeedSearchField({
	leagueId,
	value,
	onValueChange,
	onSelectTeam,
	placeholder,
}: Props) {
	const [open, setOpen] = useState(false)
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
	const [debouncedQuery, setDebouncedQuery] = useState("")

	useEffect(() => {
		const id = setTimeout(() => setDebouncedQuery(value.trim()), DEBOUNCE_MS)
		return () => clearTimeout(id)
	}, [value])

	const { data } = useQuery(LeagueSearchDocument, {
		variables: { leagueId, search: debouncedQuery },
		skip: !leagueId || debouncedQuery.length < MIN_QUERY_LENGTH,
	})

	const teams = data?.teams ?? []
	const players = data?.players ?? []

	function selectTeam(team: Team) {
		onSelectTeam({ id: team.id, name: team.name })
		setOpen(false)
		setHighlightedKey(null)
	}

	function selectPlayer(player: (typeof players)[number]) {
		onValueChange(player.name)
		setOpen(false)
		setHighlightedKey(null)
	}

	return (
		<div>
			<TextInput>
				<TextInput.Group>
					<TextInput.Field
						placeholder={placeholder}
						autoComplete="off"
						value={value}
						onChange={(event) => {
							onValueChange(event.target.value)
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
				open={open && (teams.length > 0 || players.length > 0)}
				highlightedKey={highlightedKey}
				onHighlightChange={setHighlightedKey}
				onSelect={(key) => {
					const team = teams.find((t) => t.id === key)
					if (team) {
						selectTeam(team)
						return
					}
					const player = players.find((p) => p.id === key)
					if (player) selectPlayer(player)
				}}
			>
				{teams.length > 0 && (
					<Combobox.Group label="Teams">
						{teams.map((team) => (
							<Combobox.Option
								key={team.id}
								optionKey={team.id}
								icon={
									<TeamBadge abbreviation={team.abbreviation} color={team.color} />
								}
							>
								{team.name}
							</Combobox.Option>
						))}
					</Combobox.Group>
				)}
				{players.length > 0 && (
					<Combobox.Group label="Players">
						{players.map((player) => (
							<Combobox.Option
								key={player.id}
								optionKey={player.id}
								icon={
									player.currentTeam && (
										<TeamBadge
											abbreviation={player.currentTeam.abbreviation}
											color={player.currentTeam.color}
										/>
									)
								}
							>
								{player.name}
							</Combobox.Option>
						))}
					</Combobox.Group>
				)}
			</Combobox>
		</div>
	)
}
