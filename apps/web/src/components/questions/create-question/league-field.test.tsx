import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type { QuestionData } from "./data-context"
import { useWatch } from "./form-context"
import { LeagueField } from "./league-field"
import { renderPanel } from "./test-utils"

const sports: QuestionData["sports"] = [
	{
		id: "sport-1",
		name: "Basketball",
		slug: "basketball",
		leagues: [
			{ id: "league-1", name: "NBA", abbreviation: "NBA", slug: "nba" },
		],
	},
]

// Everything a league change might clear, as one readable string.
function Picks() {
	const gameId = useWatch("gameId")
	const locksAt = useWatch("locksAt")
	const ballot = useWatch("ballot")
	const awardDivisions = useWatch("awardDivisions")
	return (
		<output data-testid="picks">
			{JSON.stringify({
				gameId: gameId ?? null,
				locksAt,
				ballotId: ballot?.ballotId ?? null,
				awardDivisions,
			})}
		</output>
	)
}

const picked = {
	leagueId: "league-1",
	sportId: "sport-1",
	gameId: "game-1",
	locksAt: "2099-01-01T12:00",
	ballot: { ballotId: "ballot-1", label: "", slot: undefined },
	awardConferences: ["East"],
	awardDivisions: ["Atlantic"],
}

function picks() {
	return JSON.parse(screen.getByTestId("picks").textContent ?? "{}")
}

describe("LeagueField: a league change clears what belonged to the old one", () => {
	it("clears the game, its lock time, the ballot and the divisions", async () => {
		const user = userEvent.setup()
		renderPanel(
			<>
				<LeagueField />
				<Picks />
			</>,
			{ values: picked, data: { sports } },
		)

		await user.type(screen.getByPlaceholderText("Search leagues…"), "x")
		expect(picks()).toEqual({
			gameId: null,
			locksAt: "",
			ballotId: null,
			awardDivisions: [],
		})
	})

	it("keeps a ballot fixed by the URL", async () => {
		const user = userEvent.setup()
		renderPanel(
			<>
				<LeagueField />
				<Picks />
			</>,
			{ values: picked, data: { sports, lockedBallotId: "ballot-1" } },
		)

		await user.type(screen.getByPlaceholderText("Search leagues…"), "x")
		expect(picks().ballotId).toBe("ballot-1")
	})
})
