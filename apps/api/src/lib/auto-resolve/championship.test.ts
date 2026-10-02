import { describe, expect, it } from "vitest"
import type { EspnPostseasonEvent } from "../../db/sync/espn-client"
import { espnFixture } from "../../test/helpers"
import { findChampionshipWinner } from "./championship"

// Trimmed from ESPN's postseason scoreboards (2026-09-13): the 2025 NBA and
// MLB postseasons and the 2025 NFL postseason. NHL (2026-10-01): the 2026
// conference finals and Stanley Cup Final.
const events = (league: "nba" | "nfl" | "mlb" | "nhl") =>
	espnFixture<{ events: EspnPostseasonEvent[] }>(`postseason-${league}.json`)
		.events

const winnerOf = (
	league: "nba" | "nfl" | "mlb" | "nhl",
	key: Parameters<typeof findChampionshipWinner>[0],
) => findChampionshipWinner(key, events(league))?.espnTeamId

describe("findChampionshipWinner", () => {
	it("takes a series title from the game that completed the series", () => {
		// OKC beat IND in the Finals; IND won the East, OKC the West.
		expect(winnerOf("nba", "nba:NBA Finals")).toBe("25")
		expect(winnerOf("nba", "nba:Conference Finals:East")).toBe("11")
		expect(winnerOf("nba", "nba:Conference Finals:West")).toBe("25")
		// LAD beat TOR in the World Series; TOR won the ALCS, LAD the NLCS.
		expect(winnerOf("mlb", "mlb:World Series")).toBe("19")
		expect(winnerOf("mlb", "mlb:Pennant:AL")).toBe("14")
		expect(winnerOf("mlb", "mlb:Pennant:NL")).toBe("19")
		// CAR beat VGK in the Stanley Cup Final; CAR won the East, VGK the West.
		expect(winnerOf("nhl", "nhl:Stanley Cup")).toBe("7")
		expect(winnerOf("nhl", "nhl:Conference Final:East")).toBe("7")
		expect(winnerOf("nhl", "nhl:Conference Final:West")).toBe("37")
	})

	it("takes an NFL title from its single game", () => {
		// SEA beat NE in the Super Bowl.
		expect(winnerOf("nfl", "nfl:Super Bowl")).toBe("26")
		expect(winnerOf("nfl", "nfl:Championship:NFC")).toBe("26")
		expect(winnerOf("nfl", "nfl:Championship:AFC")).toBe("17")
	})

	it("has no winner while the deciding series is still going", () => {
		const beforeGameSeven = events("nba").filter(
			(event) =>
				!event.competitions[0].notes?.some(
					(note) => note.headline === "NBA Finals - Game 7",
				),
		)
		expect(findChampionshipWinner("nba:NBA Finals", beforeGameSeven)).toBeNull()
	})
})
