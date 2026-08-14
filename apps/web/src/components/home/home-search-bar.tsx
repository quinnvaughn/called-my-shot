import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react"
import { FiClock, FiSearch, FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { Combobox } from "#/components/ui/combobox"
import { TeamBadge } from "#/components/ui/team-badge"
import { TextInput } from "#/components/ui/text-input"
import type { HomePageQuery } from "#/graphql/generated/graphql"

type TeamOption = HomePageQuery["teams"][number]
type PlayerOption = HomePageQuery["players"][number]

type HomeSearchBarProps = {
	// Global, not scoped to any league - see HomeFeed.
	teams: TeamOption[]
	players: PlayerOption[]
	onCommitSearch: (term: string) => void
	// A team suggestion sets the real teamId filter (exact - also matches
	// field-style questions the team is an option in, not just its subject),
	// not a text search - text search only ilikes the question/creator/subject
	// team/subject player, which would miss those field questions entirely.
	onSelectTeam: (team: TeamOption) => void
}

type FlatOption =
	| { kind: "search"; key: string; term: string }
	| { kind: "team"; key: string; team: TeamOption }
	| { kind: "player"; key: string; term: string }
	| { kind: "recent"; key: string; term: string }

const MAX_SUGGESTIONS = 5
const MAX_RECENT = 5

// Twitter/Reddit-style: typing only drives the suggestion dropdown, the feed
// itself doesn't refetch until a suggestion is picked or the search is
// committed (Enter, or clicking the pinned "search for" option) - see
// selectOption below, which routes to either onSelectTeam or onCommitSearch.
export function HomeSearchBar({
	teams,
	players,
	onCommitSearch,
	onSelectTeam,
}: HomeSearchBarProps) {
	const [inputValue, setInputValue] = useState("")
	const [open, setOpen] = useState(false)
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
	// In-memory for this session only, same as the mock's recentSearches.
	const [recentSearches, setRecentSearches] = useState<string[]>([])
	const wrapRef = useRef<HTMLDivElement>(null)

	const query = inputValue.trim().toLowerCase()

	const teamMatches = useMemo(
		() =>
			query === ""
				? []
				: teams
						.filter(
							(team) =>
								team.name.toLowerCase().includes(query) ||
								team.abbreviation.toLowerCase().includes(query),
						)
						.slice(0, MAX_SUGGESTIONS),
		[teams, query],
	)

	const playerMatches = useMemo(
		() =>
			query === ""
				? []
				: players
						.filter((player) => player.name.toLowerCase().includes(query))
						.slice(0, MAX_SUGGESTIONS),
		[players, query],
	)

	// Keyboard-navigable order: pinned free-text option first, then teams, then
	// players, when there's a query - just the recent list otherwise.
	const flatOptions: FlatOption[] = useMemo(() => {
		if (query === "") {
			return recentSearches.map((term) => ({
				kind: "recent",
				key: `recent:${term}`,
				term,
			}))
		}
		return [
			{ kind: "search", key: "search", term: inputValue.trim() },
			...teamMatches.map(
				(team): FlatOption => ({ kind: "team", key: `team:${team.id}`, team }),
			),
			...playerMatches.map(
				(player): FlatOption => ({
					kind: "player",
					key: `player:${player.id}`,
					term: player.name,
				}),
			),
		]
	}, [query, recentSearches, inputValue, teamMatches, playerMatches])

	useEffect(() => {
		if (!open) return
		function onPointerDown(event: MouseEvent) {
			if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
		}
		document.addEventListener("mousedown", onPointerDown)
		return () => document.removeEventListener("mousedown", onPointerDown)
	}, [open])

	function recordRecent(term: string) {
		if (!term) return
		setRecentSearches((prev) =>
			[term, ...prev.filter((t) => t !== term)].slice(0, MAX_RECENT),
		)
	}

	function commitSearch(term: string) {
		const trimmed = term.trim()
		setInputValue(trimmed)
		recordRecent(trimmed)
		setOpen(false)
		setHighlightedKey(null)
		onCommitSearch(trimmed)
	}

	// A team pick is just another kind of commit - it leaves its name in the
	// box and joins recent searches exactly like a text/player commit does,
	// it just notifies the parent through onSelectTeam instead of
	// onCommitSearch since HomeFeed needs the team's id (and league), not
	// just its display name.
	function selectOption(option: FlatOption) {
		if (option.kind === "team") {
			setInputValue(option.team.name)
			recordRecent(option.team.name)
			setOpen(false)
			setHighlightedKey(null)
			onSelectTeam(option.team)
			return
		}
		commitSearch(option.term)
	}

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault()
			if (flatOptions.length === 0) return
			const currentIndex = flatOptions.findIndex(
				(o) => o.key === highlightedKey,
			)
			const delta = event.key === "ArrowDown" ? 1 : -1
			const nextIndex =
				(currentIndex + delta + flatOptions.length) % flatOptions.length
			setHighlightedKey(flatOptions[nextIndex]?.key ?? null)
		} else if (event.key === "Enter") {
			event.preventDefault()
			const highlighted = flatOptions.find((o) => o.key === highlightedKey)
			if (highlighted) selectOption(highlighted)
			else commitSearch(inputValue)
		} else if (event.key === "Escape") {
			setOpen(false)
			event.currentTarget.blur()
		}
	}

	return (
		<div ref={wrapRef} className={css({ position: "relative" })}>
			<TextInput>
				<TextInput.Group>
					<TextInput.Icon>
						<FiSearch size={15} />
					</TextInput.Icon>
					<TextInput.Field
						placeholder="Search questions, teams, callers…"
						autoComplete="off"
						value={inputValue}
						onChange={(event) => {
							setInputValue(event.target.value)
							setHighlightedKey(null)
							setOpen(true)
						}}
						onFocus={() => setOpen(true)}
						onKeyDown={handleKeyDown}
					/>
					{inputValue && (
						<TextInput.IconButton
							aria-label="Clear search"
							onClick={() => {
								setInputValue("")
								setOpen(false)
								onCommitSearch("")
							}}
						>
							<FiX size={15} />
						</TextInput.IconButton>
					)}
				</TextInput.Group>
			</TextInput>
			<Combobox
				open={open && (query !== "" || recentSearches.length > 0)}
				highlightedKey={highlightedKey}
				onHighlightChange={setHighlightedKey}
				onSelect={(key) => {
					const option = flatOptions.find((o) => o.key === key)
					if (option) selectOption(option)
				}}
			>
				{query === "" ? (
					<Combobox.Group
						label="Recent"
						action={
							<button
								type="button"
								className={css({
									fontFamily: "mono",
									fontSize: "3xs",
									letterSpacing: "wide",
									color: "fg.subtle",
									_hover: { color: "primary.default" },
								})}
								onClick={(event) => {
									event.stopPropagation()
									setRecentSearches([])
								}}
							>
								Clear
							</button>
						}
					>
						{recentSearches.map((term) => (
							<Combobox.Option
								key={`recent:${term}`}
								optionKey={`recent:${term}`}
								icon={<FiClock size={14} />}
							>
								{term}
							</Combobox.Option>
						))}
					</Combobox.Group>
				) : (
					<>
						<Combobox.Option optionKey="search" icon={<FiSearch size={14} />}>
							Search for "{inputValue.trim()}"
						</Combobox.Option>
						{teamMatches.length > 0 && (
							<Combobox.Group label="Teams">
								{teamMatches.map((team) => (
									<Combobox.Option
										key={team.id}
										optionKey={`team:${team.id}`}
										icon={
											<TeamBadge
												abbreviation={team.abbreviation}
												color={team.color}
											/>
										}
										meta={team.league.abbreviation}
									>
										{team.name}
									</Combobox.Option>
								))}
							</Combobox.Group>
						)}
						{playerMatches.length > 0 && (
							<Combobox.Group label="Players">
								{playerMatches.map((player) => (
									<Combobox.Option
										key={player.id}
										optionKey={`player:${player.id}`}
										icon={
											player.currentTeam && (
												<TeamBadge
													abbreviation={player.currentTeam.abbreviation}
													color={player.currentTeam.color}
												/>
											)
										}
										meta={player.currentTeam?.league.abbreviation}
									>
										{player.name}
									</Combobox.Option>
								))}
							</Combobox.Group>
						)}
						{teamMatches.length === 0 && playerMatches.length === 0 && (
							<Combobox.Empty>No matching teams or players</Combobox.Empty>
						)}
					</>
				)}
			</Combobox>
		</div>
	)
}
