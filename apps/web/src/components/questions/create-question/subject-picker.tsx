import { useState } from "react"
import { HStack, VStack } from "styled-system/jsx"
import { ChipButton } from "#/components/ui/chip-button"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import type {
	PlayersByLeagueQuery,
	TeamsByLeagueQuery,
} from "#/graphql/generated/graphql"
import type { EntitySearchItem } from "./entity-search-field"
import { EntitySearchField } from "./entity-search-field"
import { useSetValue, useWatch } from "./form-context"

type Team = TeamsByLeagueQuery["teams"][number]
type Player = PlayersByLeagueQuery["players"][number]

type Props = {
	teams: Team[]
	players: Player[]
	// Fixed shapes (player_stat_*, team_stat_*) already know which kind of
	// subject they're about from their own name - no chip toggle needed, just
	// search that one kind. "either" is yes_no_prop's case: the one shape
	// where the subject's kind (or lack of one) is a real per-question choice,
	// not implied by the shape itself.
	kind: "player" | "team" | "either"
	// player_stat_over_under/team_stat_over_under, their season-long
	// counterparts, and both numeric-guess shapes are always required - the
	// stat has to resolve against someone. game_total_over_under is the
	// actual subject-less over/under (a game-wide line has none) and never
	// renders this component at all. yes_no_prop's is always optional. Only
	// changes the hint copy below -
	// the schema itself is what actually enforces the requirement.
	required?: boolean
}

// who or what the stat (or the yes/no itself) is actually about. Must
// resolve to a real team or player, no freeform fallback (unlike the stat
// picker), since it's what resolution checks against.
export function SubjectPicker({ teams, players, kind, required }: Props) {
	const [chipKind, setChipKind] = useState<"player" | "team">(
		kind === "team" ? "team" : "player",
	)
	const subjectType = kind === "either" ? chipKind : kind
	const subjectTeamId = useWatch("subjectTeamId")
	const subjectPlayerId = useWatch("subjectPlayerId")
	const setValue = useSetValue()
	const [inputText, setInputText] = useState("")

	const items: EntitySearchItem[] =
		subjectType === "team"
			? teams.map((team) => ({
					id: team.id,
					label: team.name,
					kind: "team" as const,
					meta: team.abbreviation,
				}))
			: players.map((player) => ({
					id: player.id,
					label: player.name,
					kind: "player" as const,
					meta: player.currentTeam?.abbreviation,
				}))

	const selectedLabel =
		subjectType === "team"
			? (teams.find((team) => team.id === subjectTeamId)?.name ?? "")
			: (players.find((player) => player.id === subjectPlayerId)?.name ?? "")

	return (
		<VStack gap="2.5" alignItems="stretch">
			<FieldLabel required={required}>Subject</FieldLabel>
			{kind === "either" && (
				<HStack gap="1.5">
					{(["player", "team"] as const).map((type) => (
						<ChipButton
							key={type}
							selected={chipKind === type}
							onClick={() => {
								setChipKind(type)
								setValue("subjectTeamId", undefined)
								setValue("subjectPlayerId", undefined)
								setInputText("")
							}}
						>
							{type.toUpperCase()}
						</ChipButton>
					))}
				</HStack>
			)}
			<EntitySearchField
				value={inputText || selectedLabel}
				onValueChange={(text) => {
					setInputText(text)
					setValue("subjectTeamId", undefined)
					setValue("subjectPlayerId", undefined)
				}}
				items={items}
				placeholder={
					subjectType === "team" ? "Search teams…" : "Search players…"
				}
				required={required}
				onSelectItem={(item) => {
					setInputText(item.label)
					if (item.kind === "team") {
						setValue("subjectTeamId", item.id)
						setValue("subjectPlayerId", undefined)
					} else {
						setValue("subjectPlayerId", item.id)
						setValue("subjectTeamId", undefined)
					}
				}}
			/>
			<FieldHint>
				{required
					? "Required - this is who the stat resolves against."
					: "Optional - leave blank for a proposition with no single team or player it's about."}
			</FieldHint>
		</VStack>
	)
}
