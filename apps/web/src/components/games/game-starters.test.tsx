import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { FragmentType } from "#/graphql/generated"
import type { GameStarters_GameFragment } from "#/graphql/generated/graphql"
import { GameStarters, type GameStartersFragment } from "./game-starters"

type Starter = GameStarters_GameFragment["starters"][number]

const awayTeam = { id: "away", abbreviation: "NYY", color: "#132448" }
const homeTeam = { id: "home", abbreviation: "BOS", color: "#BD3039" }

let n = 0
const starter = (
	teamId: string,
	fields: Partial<Starter> & Pick<Starter, "role" | "playerName">,
): Starter => ({
	id: `s${++n}`,
	sortOrder: 1,
	position: null,
	statLine: null,
	injuryStatus: null,
	team: { id: teamId },
	...fields,
})

const renderStarters = (starters: Starter[]) =>
	render(
		<GameStarters
			game={
				{ id: "g", awayTeam, homeTeam, starters } as unknown as FragmentType<
					typeof GameStartersFragment
				>
			}
		/>,
	)

describe("GameStarters", () => {
	it("renders nothing when the game has no starters yet", () => {
		const { container } = renderStarters([])
		expect(container).toBeEmptyDOMElement()
	})

	it("shows each probable pitcher collapsed and the batting orders once expanded", () => {
		renderStarters([
			starter("away", {
				role: "STARTING_PITCHER",
				playerName: "Carlos Rodon",
				position: "SP",
				statLine: "5-3, 3.09 ERA",
			}),
			starter("away", {
				role: "BATTER",
				playerName: "Aaron Judge",
				position: "RF",
				sortOrder: 2,
			}),
			starter("home", {
				role: "STARTING_PITCHER",
				playerName: "Brayan Bello",
				position: "SP",
			}),
		])

		expect(screen.getByText("Carlos Rodon")).toBeInTheDocument()
		expect(screen.getByText("5-3, 3.09 ERA")).toBeInTheDocument()
		expect(screen.getByText("Brayan Bello")).toBeInTheDocument()
		expect(screen.queryByText("Aaron Judge")).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: /show all/i }))

		expect(screen.getByText("Aaron Judge")).toBeInTheDocument()
		expect(screen.getByText("Not posted yet")).toBeInTheDocument()
	})

	it("leads an NFL team with its quarterback and injury tag", () => {
		renderStarters([
			starter("home", {
				role: "OFFENSE",
				playerName: "Jaxson Dart",
				position: "QB",
				injuryStatus: "Questionable",
			}),
			starter("home", {
				role: "OFFENSE",
				playerName: "Cam Skattebo",
				position: "RB",
				sortOrder: 2,
			}),
			starter("away", {
				role: "DEFENSE",
				playerName: "Shelby Harris",
				position: "LDE",
			}),
		])

		expect(screen.getByText("Jaxson Dart")).toBeInTheDocument()
		expect(screen.getByText("Questionable")).toBeInTheDocument()
		expect(screen.queryByText("Cam Skattebo")).not.toBeInTheDocument()
		expect(screen.getByText("Not announced yet")).toBeInTheDocument()
	})

	it("shows only the key lines, with nothing to expand, when compact", () => {
		render(
			<GameStarters
				compact
				game={
					{
						id: "g",
						awayTeam,
						homeTeam,
						starters: [
							starter("away", {
								role: "STARTING_PITCHER",
								playerName: "Carlos Rodon",
								position: "SP",
							}),
							starter("away", {
								role: "BATTER",
								playerName: "Aaron Judge",
								position: "RF",
							}),
						],
					} as unknown as FragmentType<typeof GameStartersFragment>
				}
			/>,
		)

		expect(screen.getByText("Carlos Rodon")).toBeInTheDocument()
		expect(screen.queryByText("Aaron Judge")).not.toBeInTheDocument()
		expect(
			screen.queryByRole("button", { name: /show all/i }),
		).not.toBeInTheDocument()
	})
})
