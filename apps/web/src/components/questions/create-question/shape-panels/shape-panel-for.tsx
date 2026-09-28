import { match } from "ts-pattern"
import type { CreateQuestionValues } from "../form-context"
import { AwardPanel } from "./award-panel"
import { FinalistsPanel } from "./finalists-panel"
import { HeadToHeadPanel } from "./head-to-head-panel"
import { MatchupPanel } from "./matchup-panel"
import {
	GameStatLeaderPanel,
	SeasonStatLeaderPanel,
	TeamStatLeaderPanel,
} from "./stat-leader-panels"
import { StatPanel } from "./stat-panel"
import { YesNoPanel } from "./yes-no-panel"

// The one place a shape turns into a panel. Its own component rather than
// inline in the form so the whole mapping can be exercised directly - notably
// the invariant that a panel renders a game picker exactly when the shape is
// not season-long, which is the same condition selectType clears gameId on.
export function ShapePanelFor({
	shape,
}: {
	shape: CreateQuestionValues["shape"]
}) {
	return (
		match(shape)
			.with(
				"player_stat_over_under",
				"team_stat_over_under",
				"player_season_stat_over_under",
				"team_season_stat_over_under",
				"game_total_over_under",
				"player_stat_numeric_guess",
				"team_stat_numeric_guess",
				"team_season_stat_numeric_guess",
				// No key: this panel spans eight shapes and must not
				// remount between them, matching the single JSX branch
				// they all used to share.
				(s) => <StatPanel shape={s} />,
			)
			.with(
				"player_vs_player",
				"player_vs_player_season",
				"team_vs_team_season",
				// Keyed, unlike StatPanel: these three were separate JSX
				// branches, so switching between them remounted
				// LeagueField and StatPicker and cleared their typed-in
				// text. Merging them into one component would silently
				// start preserving it without this.
				(s) => <HeadToHeadPanel key={s} shape={s} />,
			)
			.with("team_vs_team", () => <MatchupPanel />)
			.with("player_game_stat_leader", () => <GameStatLeaderPanel />)
			.with("player_season_stat_leader", () => <SeasonStatLeaderPanel />)
			.with("player_team_season_stat_leader", () => <TeamStatLeaderPanel />)
			.with("yes_no_prop", () => <YesNoPanel />)
			// No key, same reasoning as StatPanel: these two shared one
			// branch, so switching between them kept the league and
			// award-name text already typed in.
			.with("player_season_award", "team_season_award", (s) => (
				<AwardPanel shape={s} />
			))
			.with("player_award_finalists", () => <FinalistsPanel />)
			.exhaustive()
	)
}
