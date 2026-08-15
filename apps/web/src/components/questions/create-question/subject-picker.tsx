import { useState } from "react"
import { HStack, VStack } from "styled-system/jsx"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import type {
	PlayersByLeagueQuery,
	TeamsByLeagueQuery,
} from "#/graphql/generated/graphql"
import { ChipButton } from "./chip-button"
import type { EntitySearchItem } from "./entity-search-field"
import { EntitySearchField } from "./entity-search-field"
import type { CreateQuestionFormApi } from "./form-types"

type Team = TeamsByLeagueQuery["teams"][number]
type Player = PlayersByLeagueQuery["players"][number]

type Props = {
	form: CreateQuestionFormApi
	teams: Team[]
	players: Player[]
	// over_under's subject is optional (a game-wide line has none); numeric_
	// guess's is required (the stat has to resolve against someone). Only
	// changes the hint copy below - the schema itself is what actually
	// enforces the requirement.
	required?: boolean
}

// who or what the stat (or the yes/no itself) is actually about. Must
// resolve to a real team or player, no freeform fallback (unlike the stat
// picker), since it's what resolution checks against.
export function SubjectPicker({ form, teams, players, required }: Props) {
	const subjectType = form.useWatch("numericSubjectType")
	const subjectTeamId = form.useWatch("subjectTeamId")
	const subjectPlayerId = form.useWatch("subjectPlayerId")
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
			<HStack gap="1.5">
				{(["player", "team"] as const).map((type) => (
					<ChipButton
						key={type}
						selected={subjectType === type}
						onClick={() => {
							form.setValue("numericSubjectType", type)
							form.setValue("subjectTeamId", undefined)
							form.setValue("subjectPlayerId", undefined)
							setInputText("")
						}}
					>
						{type.toUpperCase()}
					</ChipButton>
				))}
			</HStack>
			<EntitySearchField
				value={inputText || selectedLabel}
				onValueChange={(text) => {
					setInputText(text)
					form.setValue("subjectTeamId", undefined)
					form.setValue("subjectPlayerId", undefined)
				}}
				items={items}
				placeholder={
					subjectType === "team" ? "Search teams…" : "Search players…"
				}
				required={required}
				onSelectItem={(item) => {
					setInputText(item.label)
					// Picking straight from search (without touching a chip first)
					// still has to land on a real subject type - the chips aren't
					// the only way numericSubjectType gets set.
					if (item.kind === "team") {
						form.setValue("numericSubjectType", "team")
						form.setValue("subjectTeamId", item.id)
						form.setValue("subjectPlayerId", undefined)
					} else {
						form.setValue("numericSubjectType", "player")
						form.setValue("subjectPlayerId", item.id)
						form.setValue("subjectTeamId", undefined)
					}
				}}
			/>
			<FieldHint>
				{required
					? "Required - this is who the stat resolves against."
					: "Optional - leave blank for a game-wide line with no single team or player it's about."}
			</FieldHint>
		</VStack>
	)
}
