import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { renderPanel } from "../test-utils"
import { AwardPanel } from "./award-panel"

describe("AwardPanel", () => {
	it("offers the player-only filters for a player award", () => {
		renderPanel(<AwardPanel shape="player_season_award" />, {
			values: { shape: "player_season_award" },
		})

		expect(screen.getByText("Conference")).toBeInTheDocument()
		expect(screen.getByText("Division")).toBeInTheDocument()
		expect(screen.getByText("Position")).toBeInTheDocument()
		expect(screen.getByText("Years in the league")).toBeInTheDocument()
		expect(
			screen.getByRole("switch", { name: "Rookie of the Year only" }),
		).toBeInTheDocument()
	})

	it("hides the player-only filters for a team award", () => {
		renderPanel(<AwardPanel shape="team_season_award" />, {
			values: { shape: "team_season_award" },
		})

		// A team has no position or years in the league, and no rookie rule.
		expect(screen.getByText("Conference")).toBeInTheDocument()
		expect(screen.queryByText("Position")).not.toBeInTheDocument()
		expect(screen.queryByText("Years in the league")).not.toBeInTheDocument()
		expect(
			screen.queryByRole("switch", { name: "Rookie of the Year only" }),
		).not.toBeInTheDocument()
	})

	it("backfills the award name when rookie-only is switched on and the name is blank", async () => {
		const user = userEvent.setup()
		renderPanel(<AwardPanel shape="player_season_award" />, {
			values: { shape: "player_season_award" },
		})

		const name = screen.getByRole("textbox", { name: "Award name" })
		expect(name).toHaveValue("")

		await user.click(screen.getByRole("switch", { name: "Rookie of the Year only" }))
		expect(name).toHaveValue("Rookie of the Year")
	})

	it("does not clobber an award name the admin already typed", async () => {
		const user = userEvent.setup()
		renderPanel(<AwardPanel shape="player_season_award" />, {
			values: { shape: "player_season_award" },
		})

		const name = screen.getByRole("textbox", { name: "Award name" })
		await user.type(name, "Rookie of the Year - C")

		await user.click(screen.getByRole("switch", { name: "Rookie of the Year only" }))

		// The guard has to read the *current* name, not one captured when the
		// panel first rendered.
		expect(name).toHaveValue("Rookie of the Year - C")
	})

	it("leaves an already-typed name alone across a toggle off and back on", async () => {
		const user = userEvent.setup()
		renderPanel(<AwardPanel shape="player_season_award" />, {
			values: { shape: "player_season_award" },
		})

		const toggle = screen.getByRole("switch", {
			name: "Rookie of the Year only",
		})
		const name = screen.getByRole("textbox", { name: "Award name" })

		await user.click(toggle)
		expect(name).toHaveValue("Rookie of the Year")

		await user.clear(name)
		await user.type(name, "Top Rookie")
		await user.click(toggle)
		await user.click(toggle)

		expect(name).toHaveValue("Top Rookie")
	})

	it("prompts for a league before showing a pool", () => {
		renderPanel(<AwardPanel shape="player_season_award" />, {
			values: { shape: "player_season_award" },
			data: { awardPoolItems: null },
		})
		expect(screen.getByText("Pick a league to see the pool.")).toBeInTheDocument()
	})

	it("summarises the pool once there is one", () => {
		renderPanel(<AwardPanel shape="player_season_award" />, {
			values: { shape: "player_season_award" },
			data: {
				awardPoolItems: [
					{ id: "1", label: "A", kind: "player" },
					{ id: "2", label: "B", kind: "player" },
				],
			},
		})
		expect(screen.getByText(/every player in the league \(2\)/)).toBeInTheDocument()
	})
})
