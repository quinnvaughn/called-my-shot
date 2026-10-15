import { useQuestionData } from "#/components/questions/create-question/data-context"
import { useWatch } from "#/components/questions/create-question/form-context"
import { LeagueField } from "#/components/questions/create-question/league-field"
import { PoolSummary } from "#/components/questions/create-question/pool-summary"
import { StatPicker } from "#/components/questions/create-question/stat-picker"
import { SubjectPicker } from "#/components/questions/create-question/subject-picker"
import { FieldHint } from "#/components/ui/field-hint"
import { PanelNote } from "./panel-note"
import { ShapePanel } from "./shape-panel"

// player_team_season_stat_leader - the pool is the picked team's roster, so
// like the game-scoped leader there's nothing to curate.
export function TeamStatLeaderPanel() {
	const subjectTeamId = useWatch("subjectTeamId")
	const { stats, scopedTeams, scopedPlayers, teamStatLeaderPoolItems } =
		useQuestionData("TeamStatLeaderPanel")
	const selectedTeam = scopedTeams.find((team) => team.id === subjectTeamId)

	return (
		<ShapePanel label="The team leader">
			<LeagueField />
			<SubjectPicker
				teams={scopedTeams}
				players={scopedPlayers}
				kind="team"
				required
			/>
			<StatPicker
				stats={stats.filter(
					(s) => s.appliesTo === "BOTH" || s.appliesTo === "PLAYER",
				)}
			/>
			{teamStatLeaderPoolItems === null ? (
				<FieldHint>Pick a team to see the pool.</FieldHint>
			) : (
				<PoolSummary
					items={teamStatLeaderPoolItems}
					scopeLabel={selectedTeam?.name ?? ""}
				/>
			)}
			<PanelNote>
				The pool is every player on the team who can record this stat. Only
				stats put up for this team count, so a traded player keeps just their
				games here.
			</PanelNote>
		</ShapePanel>
	)
}
