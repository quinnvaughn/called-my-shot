import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderPanel } from "../test-utils"
import type { StatShape } from "./stat-panel"
import { StatPanel } from "./stat-panel"

// Everything below renders with a league already picked, since the panel shows
// only a hint until there is one.
function renderShape(shape: StatShape) {
	return renderPanel(<StatPanel shape={shape} />, {
		values: { shape, leagueId: "league-1", sportId: "sport-1" },
	})
}

describe("StatPanel: what each of its eight shapes asks for", () => {
	it("shows a hint instead of the stat fields until a league is picked", () => {
		renderPanel(<StatPanel shape="player_stat_over_under" />)
		expect(
			screen.getByText(/Pick a league above to choose the stat and subject/),
		).toBeInTheDocument()
		expect(screen.queryByText("Stat")).not.toBeInTheDocument()
	})

	it.each([
		"player_stat_over_under",
		"team_stat_over_under",
		"game_total_over_under",
		"player_stat_numeric_guess",
		"team_stat_numeric_guess",
	] as const)("attaches a game to %s", (shape) => {
		renderShape(shape)
		expect(screen.getByText("Game")).toBeInTheDocument()
	})

	it.each([
		"player_season_stat_over_under",
		"team_season_stat_over_under",
		"team_season_stat_numeric_guess",
	] as const)("never attaches a game to %s", (shape) => {
		renderShape(shape)
		// These are separate shapes from their game-scoped counterparts precisely
		// because they span a season.
		expect(screen.queryByText("Game")).not.toBeInTheDocument()
	})

	it.each([
		"player_stat_over_under",
		"team_stat_over_under",
		"player_season_stat_over_under",
		"team_season_stat_over_under",
		"game_total_over_under",
	] as const)("asks %s for a line", (shape) => {
		renderShape(shape)
		expect(
			screen.getByRole("spinbutton", { name: "Number" }),
		).toBeInTheDocument()
	})

	it.each([
		"player_stat_numeric_guess",
		"team_stat_numeric_guess",
		"team_season_stat_numeric_guess",
	] as const)("does not ask %s for a line", (shape) => {
		renderShape(shape)
		// The caller supplies the number on a numeric guess; the question doesn't.
		expect(
			screen.queryByRole("spinbutton", { name: "Number" }),
		).not.toBeInTheDocument()
	})

	it.each([
		"player_season_stat_over_under",
		"team_season_stat_over_under",
	] as const)("requires a total/per-game reading for %s", (shape) => {
		renderShape(shape)
		expect(screen.getByText("Total or per game")).toBeInTheDocument()
	})

	it.each([
		"player_stat_over_under",
		"game_total_over_under",
		"team_season_stat_numeric_guess",
	] as const)("does not offer an aggregation for %s", (shape) => {
		renderShape(shape)
		expect(screen.queryByText("Total or per game")).not.toBeInTheDocument()
	})

	it("asks every shape but game_total_over_under for a subject", () => {
		for (const shape of [
			"player_stat_over_under",
			"team_stat_over_under",
			"player_season_stat_over_under",
			"team_season_stat_over_under",
			"player_stat_numeric_guess",
			"team_stat_numeric_guess",
			"team_season_stat_numeric_guess",
		] as const) {
			const { unmount } = renderShape(shape)
			expect(screen.getByText("Subject")).toBeInTheDocument()
			unmount()
		}
	})

	it("asks game_total_over_under for no subject - the game is the subject", () => {
		renderShape("game_total_over_under")
		expect(screen.queryByText("Subject")).not.toBeInTheDocument()
	})
})

describe("StatPanel: which stats it offers", () => {
	const stats = [
		{
			id: "p",
			name: "Points",
			category: "c",
			sortOrder: 1,
			appliesTo: "PLAYER" as const,
			toleranceTier: {
				id: "t",
				toleranceMode: "ABSOLUTE" as const,
				toleranceValue: 1,
			},
		},
		{
			id: "t",
			name: "Team Wins",
			category: "c",
			sortOrder: 2,
			appliesTo: "TEAM" as const,
			toleranceTier: {
				id: "t",
				toleranceMode: "ABSOLUTE" as const,
				toleranceValue: 1,
			},
		},
	]

	it("offers only player stats for a player shape", () => {
		renderPanel(<StatPanel shape="player_stat_over_under" />, {
			values: {
				shape: "player_stat_over_under",
				leagueId: "l",
				sportId: "s",
			},
			data: { stats },
		})
		expect(screen.getByText("Points")).toBeInTheDocument()
		expect(screen.queryByText("Team Wins")).not.toBeInTheDocument()
	})

	it("offers only team stats for a team shape", () => {
		renderPanel(<StatPanel shape="team_stat_over_under" />, {
			values: { shape: "team_stat_over_under", leagueId: "l", sportId: "s" },
			data: { stats },
		})
		expect(screen.getByText("Team Wins")).toBeInTheDocument()
		expect(screen.queryByText("Points")).not.toBeInTheDocument()
	})

	it("treats game_total_over_under as a team shape", () => {
		renderPanel(<StatPanel shape="game_total_over_under" />, {
			values: { shape: "game_total_over_under", leagueId: "l", sportId: "s" },
			data: { stats },
		})
		// SHAPE_SUBJECT says "none", and the stat filter falls to TEAM - a game
		// total is a team-side number.
		expect(screen.getByText("Team Wins")).toBeInTheDocument()
		expect(screen.queryByText("Points")).not.toBeInTheDocument()
	})
})
