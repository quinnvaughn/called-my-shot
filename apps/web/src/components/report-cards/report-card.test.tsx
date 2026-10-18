import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import type { FragmentType } from "#/graphql/generated"
import { renderWithRouter } from "#/test/router"
import { ReportCard, type ReportCardFragment } from "./report-card"

const league = { id: "l", slug: "nfl", abbreviation: "NFL" }

// Deliberately not the same numbers as the card's totals below, so an
// assertion on a headline figure can't accidentally match a breakdown row.
const family = (over: Record<string, unknown> = {}) => ({
	family: "OVER_UNDER",
	label: "Over/Under",
	wins: 7,
	losses: 3,
	pendingCount: 0,
	netPoints: 310,
	returnPct: 22,
	...over,
})

function card(over: Record<string, unknown> = {}) {
	return {
		windowKey: "2026-reg-w3",
		windowLabel: "WEEK 3",
		windowSublabel: "SEP 20 – SEP 22",
		settledCount: 18,
		wins: 12,
		losses: 6,
		pendingCount: 0,
		streakBonusPoints: 0,
		sweepBonusPoints: 0,
		chainBonusPoints: 0,
		totalPoints: 540,
		committedPoints: 1800,
		pendingStake: 0,
		returnPct: 30,
		grade: "B",
		isFinal: true,
		league,
		byFamily: [family()],
		byShape: [],
		biggestHit: null,
		biggestMiss: null,
		bestGame: null,
		worstGame: null,
		...over,
	} as unknown as FragmentType<typeof ReportCardFragment>
}

const renderCard = (over?: Record<string, unknown>) =>
	render(<ReportCard card={card(over)} />)

describe("ReportCard", () => {
	beforeEach(() => localStorage.clear())

	it("renders nothing for a window the viewer has no calls in", () => {
		// The API still returns a card here so the permalink can name the
		// window it found nothing for - inline, there's nothing to draw.
		const { container } = renderCard({
			settledCount: 0,
			pendingCount: 0,
			wins: 0,
			losses: 0,
			totalPoints: 0,
			committedPoints: 0,
			returnPct: null,
			grade: null,
			byFamily: [],
		})
		expect(container).toBeEmptyDOMElement()
	})

	it("says what it is, not just which window it covers", () => {
		renderCard()
		// Without this the card is a grade and four numbers with no subject.
		expect(screen.getByText("Your Report Card")).toBeInTheDocument()
		expect(screen.getByText(/NFL · WEEK 3/)).toBeInTheDocument()
		expect(screen.getByText(/SEP 20 – SEP 22/)).toBeInTheDocument()
		expect(screen.getByText("B")).toBeInTheDocument()
	})

	it("shows no grade mark at all when there is no grade", () => {
		// A lone dash in the slot a letter belongs in reads as a stray mark,
		// and the status line already says why it is missing.
		renderCard({ settledCount: 3, wins: 2, losses: 1, grade: null })
		expect(screen.queryByText("–")).not.toBeInTheDocument()
		expect(screen.getByText("2 more results to grade")).toBeInTheDocument()
	})

	it("shows the four headline numbers", () => {
		renderCard()
		expect(screen.getByText("+540")).toBeInTheDocument()
		expect(screen.getByText("12–6")).toBeInTheDocument()
		expect(screen.getByText("+30%")).toBeInTheDocument()
		expect(screen.getByText("1800")).toBeInTheDocument()
	})

	it("lists each bonus the window earned under the breakdown", () => {
		renderCard({ streakBonusPoints: 48, totalPoints: 588 })
		expect(screen.getByText("Streak bonus")).toBeInTheDocument()
		expect(screen.getByText("+48")).toBeInTheDocument()
		expect(screen.getByText("+588")).toBeInTheDocument()
		// No sweep in this window, so no row claiming one.
		expect(screen.queryByText("Sweep bonus")).not.toBeInTheDocument()
	})

	it("names what is still out there while a slate runs", () => {
		renderCard({ pendingCount: 9, pendingStake: 700, isFinal: false })
		expect(
			screen.getByText("9 still out there · 700 at risk"),
		).toBeInTheDocument()
	})

	it("renders a family row per family", () => {
		renderCard({
			byFamily: [family(), family({ family: "YES_NO", label: "Yes/No" })],
		})
		expect(screen.getByText("Over/Under")).toBeInTheDocument()
		expect(screen.getByText("Yes/No")).toBeInTheDocument()
	})

	it("keeps the breakdown at family grain unless expanded", () => {
		const shapes = [
			{
				shape: "PLAYER_STAT_OVER_UNDER",
				family: "OVER_UNDER",
				label: "Player Game Over/Under",
				wins: 7,
				losses: 3,
				pendingCount: 0,
				netPoints: 300,
				returnPct: 40,
			},
			{
				shape: "TEAM_STAT_OVER_UNDER",
				family: "OVER_UNDER",
				label: "Team Game Over/Under",
				wins: 5,
				losses: 3,
				pendingCount: 0,
				netPoints: 240,
				returnPct: 20,
			},
		]
		const { rerender } = render(<ReportCard card={card({ byShape: shapes })} />)
		expect(screen.queryByText("Player Game Over/Under")).not.toBeInTheDocument()

		rerender(<ReportCard card={card({ byShape: shapes })} expanded />)
		expect(screen.getByText("Player Game Over/Under")).toBeInTheDocument()
		expect(screen.getByText("Team Game Over/Under")).toBeInTheDocument()
	})

	it("lists a single-shape family and that one shape under it", () => {
		// The nested row repeats the parent's numbers on purpose - it says the
		// family IS that shape, which the family row alone doesn't tell you.
		const shapes = [
			{
				shape: "PLAYER_STAT_OVER_UNDER",
				family: "OVER_UNDER",
				label: "Player Game Over/Under",
				wins: 7,
				losses: 3,
				pendingCount: 0,
				netPoints: 310,
				returnPct: 22,
			},
		]
		render(<ReportCard card={card({ byShape: shapes })} expanded />)
		expect(screen.getByText("Over/Under")).toBeInTheDocument()
		expect(screen.getByText("Player Game Over/Under")).toBeInTheDocument()
	})

	it("lists every shape under a family that holds several", () => {
		const shapes = [
			{
				shape: "TEAM_VS_TEAM",
				family: "HEAD_TO_HEAD",
				label: "Team vs Team",
				wins: 9,
				losses: 7,
				pendingCount: 0,
				netPoints: 150,
				returnPct: 12,
			},
			{
				shape: "PLAYER_VS_PLAYER",
				family: "HEAD_TO_HEAD",
				label: "Player Game Head-to-Head",
				wins: 4,
				losses: 2,
				pendingCount: 0,
				netPoints: 431,
				returnPct: 40,
			},
		]
		render(
			<ReportCard
				card={card({
					byFamily: [family({ family: "HEAD_TO_HEAD", label: "Head-to-Head" })],
					byShape: shapes,
				})}
				expanded
			/>,
		)
		expect(screen.getByText("Head-to-Head")).toBeInTheDocument()
		expect(screen.getByText("Team vs Team")).toBeInTheDocument()
		expect(screen.getByText("Player Game Head-to-Head")).toBeInTheDocument()
	})

	it("names the best and worst game with their record and net", async () => {
		const gameRow = (id: string, away: string, home: string) => ({
			id,
			startsAt: "2026-09-21T17:00:00Z",
			league: { id: "l", slug: "nfl" },
			awayTeam: { id: `${id}-a`, name: away, abbreviation: away },
			homeTeam: { id: `${id}-h`, name: home, abbreviation: home },
		})
		await renderWithRouter(
			<ReportCard
				card={card({
					bestGame: {
						netPoints: 225,
						wins: 3,
						losses: 1,
						game: gameRow("g1", "BUF", "KC"),
					},
					worstGame: {
						netPoints: -150,
						wins: 0,
						losses: 2,
						game: gameRow("g2", "NYJ", "MIA"),
					},
				})}
			/>,
		)
		expect(screen.getByText("Best game")).toBeInTheDocument()
		expect(
			screen.getByRole("link", { name: "BUF @ KC · 3–1" }),
		).toHaveAttribute("href", expect.stringMatching(/^\/games\/g1\//))
		expect(screen.getByText("+225")).toBeInTheDocument()
		expect(screen.getByText("Worst game")).toBeInTheDocument()
		expect(
			screen.getByRole("link", { name: "NYJ @ MIA · 0–2" }),
		).toBeInTheDocument()
	})

	it("links a best or worst game to the owner's picks on it", async () => {
		await renderWithRouter(
			<ReportCard
				card={card({
					bestGame: {
						netPoints: 225,
						wins: 3,
						losses: 1,
						game: {
							id: "g1",
							startsAt: "2026-09-21T17:00:00Z",
							league: { id: "l", slug: "nfl" },
							awayTeam: { id: "g1-a", name: "BUF", abbreviation: "BUF" },
							homeTeam: { id: "g1-h", name: "KC", abbreviation: "KC" },
						},
					},
				})}
				owner={{ id: "u1", username: "quinn", isOwn: true }}
			/>,
		)
		expect(
			screen.getByRole("link", { name: "BUF @ KC · 3–1" }),
		).toHaveAttribute("href", "/games/g1/picks/quinn")
	})

	it("offers an explicit, labelled link to the permalink", async () => {
		await renderWithRouter(
			<ReportCard
				card={card()}
				owner={{ id: "u1", username: "quinn", isOwn: true }}
			/>,
		)
		const link = screen.getByRole("link", { name: /open full Report Card/i })
		expect(link).toHaveAttribute(
			"href",
			"/user/quinn/report-cards/nfl/2026-reg-w3",
		)
	})

	it("has no permalink link when signed out", () => {
		renderCard()
		expect(
			screen.queryByRole("link", { name: /open full Report Card/i }),
		).not.toBeInTheDocument()
	})

	// Rendered without a username, so no <Link> is in the tree: collapsing is
	// about the body folding away, and dragging a router in would test the
	// harness rather than the card.
	it("collapses to just its header, and back", () => {
		render(<ReportCard card={card()} />)
		expect(screen.getByText("NET POINTS")).toBeInTheDocument()

		fireEvent.click(
			screen.getByRole("button", { name: /hide your Report Card/i }),
		)
		// The header survives, so there is something left to click.
		expect(screen.getByText("Your Report Card")).toBeInTheDocument()
		expect(screen.getByText("B")).toBeInTheDocument()
		expect(screen.queryByText("NET POINTS")).not.toBeInTheDocument()
		expect(screen.queryByText("Over/Under")).not.toBeInTheDocument()

		fireEvent.click(
			screen.getByRole("button", { name: /show your Report Card/i }),
		)
		expect(screen.getByText("NET POINTS")).toBeInTheDocument()
	})

	it("remembers being collapsed across mounts", () => {
		const { unmount } = render(<ReportCard card={card()} />)
		fireEvent.click(screen.getByRole("button", { name: /hide your/i }))
		unmount()

		render(<ReportCard card={card()} />)
		expect(screen.queryByText("NET POINTS")).not.toBeInTheDocument()
		expect(screen.getByText("Your Report Card")).toBeInTheDocument()
	})

	it("is never collapsible on the permalink, which has nothing to fold into", () => {
		render(<ReportCard card={card()} expanded />)
		expect(screen.queryByRole("button")).not.toBeInTheDocument()
		expect(screen.getByText("NET POINTS")).toBeInTheDocument()
	})
})
