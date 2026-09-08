import { describe, expect, it } from "vitest"
import {
	buildTitlePreview,
	type TitlePreviewInput,
} from "./build-title-preview"

const GAME = {
	startsAt: "2026-03-01T00:00:00.000Z",
	homeTeam: { name: "Celtics" },
	awayTeam: { name: "Nuggets" },
}

function input(over: Partial<TitlePreviewInput> = {}): TitlePreviewInput {
	return {
		shape: "player_stat_over_under",
		options: [],
		statAggregation: undefined,
		awardVerb: undefined,
		awardConferences: [],
		awardDivisions: [],
		awardName: "",
		eventClause: "",
		picksRequired: undefined,
		ouLine: undefined,
		selectedGame: null,
		selectedPlayerName: undefined,
		selectedTeamName: undefined,
		subjectName: null,
		opponentTeamName: undefined,
		statName: "",
		isRateStat: false,
		hasCatalogStat: true,
		offersStatAggregation: false,
		...over,
	}
}

// The preview is a prefill, not a validation step - every shape has to return
// null while any piece it names is still missing, rather than a half-built
// string with an empty slot in it.
describe("buildTitlePreview returns null until its shape has everything", () => {
	const cases: { shape: TitlePreviewInput["shape"]; missing: string }[] = [
		{ shape: "player_stat_over_under", missing: "player, stat, line" },
		{ shape: "team_stat_over_under", missing: "team, stat, line" },
		{ shape: "player_season_stat_over_under", missing: "player, stat, line" },
		{ shape: "team_season_stat_over_under", missing: "team, stat, line" },
		{ shape: "game_total_over_under", missing: "game, stat, line" },
		{ shape: "player_stat_numeric_guess", missing: "player, stat" },
		{ shape: "team_stat_numeric_guess", missing: "team, stat" },
		{ shape: "team_season_stat_numeric_guess", missing: "team, stat" },
		{ shape: "player_vs_player", missing: "two options, stat" },
		{ shape: "player_vs_player_season", missing: "two options, stat" },
		{ shape: "team_vs_team", missing: "game" },
		{ shape: "team_vs_team_season", missing: "two options, stat" },
		{ shape: "player_game_stat_leader", missing: "game, stat" },
		{ shape: "player_season_stat_leader", missing: "three options, stat" },
		{ shape: "yes_no_prop", missing: "event clause" },
		{ shape: "player_season_award", missing: "award name, verb" },
		{ shape: "team_season_award", missing: "award name, verb" },
		{ shape: "player_award_finalists", missing: "award name, finalists" },
	]

	// All eighteen, so a newly added shape shows up here as a gap rather than
	// silently defaulting to something.
	it.each(cases)("$shape (needs $missing)", ({ shape }) => {
		expect(buildTitlePreview(input({ shape }))).toBeNull()
	})
})

describe("buildTitlePreview builds a title once the fields are there", () => {
	it("names the opponent and the line for a player game over/under", () => {
		const title = buildTitlePreview(
			input({
				shape: "player_stat_over_under",
				selectedPlayerName: "Jayson Tatum",
				statName: "Points",
				ouLine: 27.5,
				opponentTeamName: "Nuggets",
				selectedGame: GAME,
			}),
		)
		expect(title).toContain("Jayson Tatum")
		expect(title).toContain("27.5")
		expect(title).toContain("Nuggets")
	})

	it("pads a rate stat's line to three decimals", () => {
		const title = buildTitlePreview(
			input({
				shape: "player_stat_over_under",
				selectedPlayerName: "Shohei Ohtani",
				statName: "Batting Average",
				ouLine: 0.3,
				isRateStat: true,
				opponentTeamName: "Padres",
			}),
		)
		// ".300" is a distinct value from ".3" - a bare number would silently
		// misrepresent it.
		expect(title).toContain(".300")
	})

	it("still needs an aggregation for a season over/under", () => {
		const base = {
			shape: "player_season_stat_over_under" as const,
			selectedPlayerName: "Nikola Jokic",
			statName: "Rebounds",
			ouLine: 12.5,
		}
		expect(buildTitlePreview(input(base))).toBeNull()
		expect(
			buildTitlePreview(input({ ...base, statAggregation: "per_game" })),
		).not.toBeNull()
	})

	it("needs three named players for a season stat leader", () => {
		const base = {
			shape: "player_season_stat_leader" as const,
			statName: "Points",
		}
		expect(
			buildTitlePreview(
				input({ ...base, options: [{ label: "A" }, { label: "B" }] }),
			),
		).toBeNull()
		expect(
			buildTitlePreview(
				input({
					...base,
					options: [{ label: "A" }, { label: "B" }, { label: "C" }],
				}),
			),
		).not.toBeNull()
	})

	it("ignores blank option rows when counting a season stat leader's field", () => {
		const title = buildTitlePreview(
			input({
				shape: "player_season_stat_leader",
				statName: "Points",
				options: [
					{ label: "A" },
					{ label: "B" },
					{ label: "   " },
					{ label: "" },
				],
			}),
		)
		expect(title).toBeNull()
	})

	it("treats an off-catalog stat as a rate, since nothing can classify it", () => {
		const withCatalog = buildTitlePreview(
			input({
				shape: "player_season_stat_leader",
				statName: "Points",
				hasCatalogStat: true,
				options: [{ label: "A" }, { label: "B" }, { label: "C" }],
			}),
		)
		const offCatalog = buildTitlePreview(
			input({
				shape: "player_season_stat_leader",
				statName: "RAPM",
				hasCatalogStat: false,
				options: [{ label: "A" }, { label: "B" }, { label: "C" }],
			}),
		)
		// "the most RAPM" is broken English where "the highest RAPM" is not.
		expect(withCatalog).not.toEqual(offCatalog)
		expect(offCatalog).toContain("highest")
	})

	it("builds an award title from the name, verb and winner count", () => {
		const title = buildTitlePreview(
			input({
				shape: "player_season_award",
				awardName: "MVP",
				awardVerb: "win",
				picksRequired: 1,
			}),
		)
		expect(title).toContain("MVP")
	})

	it("treats a whitespace-only award name as missing", () => {
		expect(
			buildTitlePreview(
				input({
					shape: "player_season_award",
					awardName: "   ",
					awardVerb: "win",
					picksRequired: 1,
				}),
			),
		).toBeNull()
	})

	it("builds a team_vs_team title from the game alone", () => {
		const title = buildTitlePreview(
			input({ shape: "team_vs_team", selectedGame: GAME }),
		)
		expect(title).toContain("Celtics")
		expect(title).toContain("Nuggets")
	})
})
