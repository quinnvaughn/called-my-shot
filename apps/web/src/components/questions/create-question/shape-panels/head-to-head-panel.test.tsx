import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderPanel } from "../test-utils"
import type { HeadToHeadShape } from "./head-to-head-panel"
import { HeadToHeadPanel } from "./head-to-head-panel"

const PLAYERS = [
	{
		id: "p1",
		name: "Jayson Tatum",
		position: null,
		positions: [],
		seasonsInLeague: 7,
		rookieEligible: false,
		currentTeam: null,
	},
]
const TEAMS = [
	{
		id: "t1",
		name: "Celtics",
		abbreviation: "BOS",
		color: "#007A33",
		conference: "East",
		division: "Atlantic",
	},
]

function renderShape(shape: HeadToHeadShape) {
	return renderPanel(<HeadToHeadPanel shape={shape} />, {
		// selectType pre-seeds exactly two empty slots for these shapes; the
		// panel renders rows from them rather than growing its own.
		values: {
			shape,
			leagueId: "l",
			sportId: "s",
			options: [{ label: "" }, { label: "" }],
		},
		// biome-ignore lint/suspicious/noExplicitAny: trimmed catalog rows - these panels read only id/name.
		data: {
			players: PLAYERS as any,
			teams: TEAMS as any,
			scopedPlayers: PLAYERS as any,
		},
	})
}

// One component now covers three shapes that used to be three JSX branches.
// These lock in the differences that justified merging them.
describe("HeadToHeadPanel", () => {
	it("scopes player_vs_player to a game", () => {
		renderShape("player_vs_player")
		expect(screen.getByText("Game")).toBeInTheDocument()
		expect(screen.queryByText("Total or per game")).not.toBeInTheDocument()
	})

	it("gives the season shapes no game and a required aggregation", () => {
		for (const shape of [
			"player_vs_player_season",
			"team_vs_team_season",
		] as const) {
			const { unmount } = renderShape(shape)
			expect(screen.queryByText("Game")).not.toBeInTheDocument()
			expect(screen.getByText("Total or per game")).toBeInTheDocument()
			unmount()
		}
	})

	it("labels the two slots by subject", () => {
		const { unmount } = renderShape("player_vs_player")
		expect(screen.getByText("Player A")).toBeInTheDocument()
		expect(screen.getByText("Player B")).toBeInTheDocument()
		unmount()

		renderShape("team_vs_team_season")
		expect(screen.getByText("Team A")).toBeInTheDocument()
		expect(screen.getByText("Team B")).toBeInTheDocument()
	})

	it("notes the game constraint on player_vs_player and the lack of one on team_vs_team_season", () => {
		const { unmount } = renderShape("player_vs_player")
		expect(screen.getByText(/Both from this game/)).toBeInTheDocument()
		unmount()

		renderShape("team_vs_team_season")
		expect(
			screen.getByText(/Season-long, no game attached/),
		).toBeInTheDocument()
	})

	it("gives player_vs_player_season no closing note, as before the merge", () => {
		renderShape("player_vs_player_season")
		expect(screen.queryByText(/Both from this game/)).not.toBeInTheDocument()
		expect(
			screen.queryByText(/Season-long, no game attached/),
		).not.toBeInTheDocument()
	})
})
