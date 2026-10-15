import { describe, expect, it } from "vitest"
import {
	type ConferenceStandings,
	changeNote,
	projectStandings,
	type StandingsRow,
	type StandingsTeamInput,
	statusLabel,
	tiebreakOrderAfterMove,
} from "./projected-standings"

// One conference of `divisions`, each team named by its abbreviation and
// given the wins listed for it (null = not picked).
function conference(
	name: string,
	divisions: Record<string, Record<string, number | null>>,
	positions: Record<string, number> = {},
): StandingsTeamInput[] {
	return Object.entries(divisions).flatMap(([division, teams]) =>
		Object.entries(teams).map(([abbreviation, wins]) => ({
			questionId: `q-${abbreviation}`,
			name: abbreviation,
			abbreviation,
			color: "#000000",
			logoUrl: null,
			conference: name,
			division,
			wins,
			tiebreakPosition: positions[abbreviation] ?? null,
			conviction: null,
			rebalancedFrom: null,
			callId: null,
		})),
	)
}

function section(standings: ConferenceStandings, label: string) {
	const found = standings.sections.find((s) => s.label === label)
	if (!found) throw new Error(`no section ${label}`)
	return found
}

function seeds(standings: ConferenceStandings) {
	return Object.fromEntries(
		standings.sections
			.flatMap((s) => s.rows)
			.filter((r) => r.seed !== null)
			.map((r) => [r.team.abbreviation, r.seed]),
	)
}

// Every team on a different total, so nothing here is tied.
const AFC = {
	East: { BUF: 13, MIA: 12, NYJ: 5, NE: 4 },
	North: { BAL: 14, PIT: 11, CIN: 9, CLE: 3 },
	South: { HOU: 8, IND: 6, JAX: 2, TEN: 1 },
	West: { KC: 15, LAC: 10, DEN: 7, LV: 0 },
}

describe("projectStandings", () => {
	it("returns null for a league without playoff rules", () => {
		expect(
			projectStandings({
				leagueSlug: "wnba",
				gamesPerSeason: 44,
				teams: conference("East", { East: { NYL: 30 } }),
			}),
		).toBeNull()
	})

	it("seeds NFL division winners 1-4 ahead of better wild cards", () => {
		const result = projectStandings({
			leagueSlug: "nfl",
			gamesPerSeason: 17,
			teams: conference("AFC", AFC),
		})
		const afc = result?.conferences[0]
		if (!afc) throw new Error("no conference")

		expect(seeds(afc)).toEqual({
			KC: "1",
			BAL: "2",
			BUF: "3",
			HOU: "4",
			MIA: "5",
			PIT: "6",
			LAC: "7",
		})
		const kc = afc.sections.flatMap((s) => s.rows).find((r) => r.team.abbreviation === "KC")
		expect(kc?.status).toBe("bye")
		expect(kc?.losses).toBe(2)

		const wildCard = section(afc, "Wild card")
		expect(wildCard.rows.map((r) => r.team.abbreviation).slice(0, 4)).toEqual([
			"MIA",
			"PIT",
			"LAC",
			"CIN",
		])
		expect(wildCard.lines).toEqual([{ after: 2, label: "Playoff line" }])
		expect(wildCard.rows[3].status).toBe("out")
	})

	it("gives MLB's top two division winners the byes", () => {
		const result = projectStandings({
			leagueSlug: "mlb",
			gamesPerSeason: 162,
			teams: conference("AL", {
				East: { NYY: 95, BAL: 90, BOS: 84, TB: 80, TOR: 70 },
				Central: { CLE: 88, KC: 86, DET: 85, MIN: 78, CWS: 60 },
				West: { HOU: 92, SEA: 89, TEX: 81, LAA: 72, OAK: 65 },
			}),
		})
		const al = result?.conferences[0]
		if (!al) throw new Error("no conference")
		expect(al.label).toBe("American League")
		const statusOf = (abbr: string) =>
			al.sections
				.flatMap((s) => s.rows)
				.find((r) => r.team.abbreviation === abbr)?.status
		expect(seeds(al)).toMatchObject({ NYY: "1", HOU: "2", CLE: "3", BAL: "4", SEA: "5", KC: "6" })
		expect(statusOf("NYY")).toBe("bye")
		expect(statusOf("HOU")).toBe("bye")
		expect(statusOf("CLE")).toBe("playoff")
		expect(statusOf("DET")).toBe("out")
	})

	it("draws the NBA playoff and play-in lines across the conference", () => {
		const teams = conference("East", {
			Atlantic: { BOS: 60, NYK: 52, PHI: 45, BKN: 30, TOR: 25 },
			Central: { MIL: 50, CLE: 55, IND: 46, CHI: 38, DET: 20 },
			Southeast: { ORL: 48, MIA: 44, ATL: 40, CHA: 22, WAS: 18 },
		})
		const east = projectStandings({
			leagueSlug: "nba",
			gamesPerSeason: 82,
			teams,
		})?.conferences[0]
		if (!east) throw new Error("no conference")
		expect(east.label).toBe("Eastern Conference")
		const [table] = east.sections
		expect(table.rows.map((r) => r.team.abbreviation).slice(0, 10)).toEqual([
			"BOS", "CLE", "NYK", "MIL", "ORL", "IND", "PHI", "MIA", "ATL", "CHI",
		])
		expect(table.lines).toEqual([
			{ after: 5, label: "Playoff line" },
			{ after: 9, label: "Play-in line" },
		])
		expect(table.rows[6].status).toBe("playIn")
		expect(table.rows[6].seed).toBe("7")
		expect(table.rows[10].status).toBe("out")
	})

	it("takes each NHL division's top three, then wild cards from the rest", () => {
		const east = projectStandings({
			leagueSlug: "nhl",
			gamesPerSeason: 82,
			teams: conference("East", {
				"Atlantic Division": { FLA: 50, TOR: 48, TB: 46, BOS: 45, DET: 30 },
				"Metropolitan Division": { NYR: 49, CAR: 47, NJD: 35, PIT: 33, CBJ: 25 },
			}),
		})?.conferences[0]
		if (!east) throw new Error("no conference")

		const atlantic = section(east, "Atlantic Division")
		expect(atlantic.lines).toEqual([{ after: 2, label: "Playoff line" }])
		expect(atlantic.rows[2].status).toBe("playoff")
		expect(section(east, "Metropolitan Division").rows[2].status).toBe(
			"playoff",
		)
		const wildCard = section(east, "Wild card")
		expect(wildCard.rows.map((r) => [r.team.abbreviation, r.seed])).toEqual([
			["BOS", "WC1"],
			["PIT", "WC2"],
			["DET", null],
			["CBJ", null],
		])
	})

	it("puts an untouched tie in alphabetical order and lets it trade places", () => {
		const east = projectStandings({
			leagueSlug: "nba",
			gamesPerSeason: 82,
			teams: conference("East", { Atlantic: { NYK: 50, BOS: 50, PHI: 40 } }),
		})?.conferences[0]
		if (!east) throw new Error("no conference")
		expect(
			east.sections[0].rows.map((r) => [
				r.team.abbreviation,
				r.rank,
				r.canMoveUp,
				r.canMoveDown,
			]),
		).toEqual([
			["BOS", 1, false, true],
			["NYK", 2, true, false],
			["PHI", 3, false, false],
		])
	})

	it("applies the user's order to a tie", () => {
		const east = projectStandings({
			leagueSlug: "nba",
			gamesPerSeason: 82,
			teams: conference(
				"East",
				{ Atlantic: { BOS: 50, NYK: 50, PHI: 40 } },
				{ NYK: 0, BOS: 1 },
			),
		})?.conferences[0]
		if (!east) throw new Error("no conference")
		expect(
			east.sections[0].rows.map((r) => [r.team.abbreviation, r.rank, r.seed]),
		).toEqual([
			["NYK", 1, "1"],
			["BOS", 2, "2"],
			["PHI", 3, "3"],
		])
	})

	it("lets the user's order decide a tie at the playoff line", () => {
		const teams = conference("AFC", {
			...AFC,
			North: { BAL: 14, PIT: 11, CIN: 11, CLE: 3 },
			West: { KC: 15, LAC: 11, DEN: 7, LV: 0 },
		})
		const wildCard = (positions: Record<string, number>) => {
			const afc = projectStandings({
				leagueSlug: "nfl",
				gamesPerSeason: 17,
				teams: teams.map((t) => ({
					...t,
					tiebreakPosition: positions[t.abbreviation] ?? null,
				})),
			})?.conferences[0]
			if (!afc) throw new Error("no conference")
			return section(afc, "Wild card").rows.map((r) => [
				r.team.abbreviation,
				r.status,
			])
		}
		expect(wildCard({}).slice(0, 4)).toEqual([
			["MIA", "playoff"],
			["CIN", "playoff"],
			["LAC", "playoff"],
			["PIT", "out"],
		])
		expect(wildCard({ PIT: 0, CIN: 1, LAC: 2 }).slice(0, 4)).toEqual([
			["MIA", "playoff"],
			["PIT", "playoff"],
			["CIN", "playoff"],
			["LAC", "out"],
		])
	})

	it("lets the user's order decide a tie for a division lead", () => {
		const leaders = (positions: Record<string, number>) => {
			const afc = projectStandings({
				leagueSlug: "nfl",
				gamesPerSeason: 17,
				teams: conference(
					"AFC",
					{ ...AFC, East: { BUF: 13, MIA: 13, NYJ: 5, NE: 4 } },
					positions,
				),
			})?.conferences[0]
			if (!afc) throw new Error("no conference")
			return section(afc, "Division leaders").rows.map(
				(r) => r.team.abbreviation,
			)
		}
		expect(leaders({})).toEqual(["KC", "BAL", "BUF", "HOU"])
		expect(leaders({ MIA: 0, BUF: 1 })).toEqual(["KC", "BAL", "MIA", "HOU"])
	})

	it("lists unpicked teams last and holds seeds until the conference is full", () => {
		const afc = projectStandings({
			leagueSlug: "nfl",
			gamesPerSeason: 17,
			teams: conference("AFC", { ...AFC, East: { BUF: 13, MIA: null, NYJ: 5, NE: null } }),
		})?.conferences[0]
		if (!afc) throw new Error("no conference")
		expect(afc.seedsNote).toBe("Pick every AFC team to see seeds.")
		expect(seeds(afc)).toEqual({})
		expect(
			section(afc, "East").rows.map((r) => [r.team.abbreviation, r.rank]),
		).toEqual([
			["BUF", 1],
			["NYJ", 2],
			["MIA", null],
			["NE", null],
		])
	})

	it("adds up projected wins against the league's real total", () => {
		const result = projectStandings({
			leagueSlug: "nfl",
			gamesPerSeason: 17,
			teams: [
				...conference("AFC", { East: { BUF: 12, MIA: null } }),
				...conference("NFC", { East: { PHI: 13, DAL: 9 } }),
			],
		})
		expect(result).toMatchObject({
			projectedWins: 34,
			leagueWins: 34,
			pickedCount: 3,
			teamCount: 4,
		})
		expect(result?.conferences.map((c) => c.conference)).toEqual(["AFC", "NFC"])
	})

	it("qualifies the division name only where another conference shares it", () => {
		const result = projectStandings({
			leagueSlug: "nfl",
			gamesPerSeason: 17,
			teams: [
				...conference("AFC", { East: { BUF: 12 } }),
				...conference("NFC", { East: { PHI: 13 } }),
			],
		})
		expect(result?.conferences[0].sections[0].label).toBe("AFC East")
	})

	it("moves only the team that was moved past a tied team in between", () => {
		// All on 10, so the conference order is BUF, KC, MIA. BUF and MIA are
		// neighbours in the AFC East table.
		const teams = conference("AFC", {
			East: { BUF: 10, MIA: 10 },
			West: { KC: 10 },
		})
		const order = (movingId: string, targetId: string) =>
			tiebreakOrderAfterMove(teams, movingId, targetId).map((id) =>
				id.replace("q-", ""),
			)
		expect(order("q-BUF", "q-MIA")).toEqual(["KC", "MIA", "BUF"])
		expect(order("q-MIA", "q-BUF")).toEqual(["MIA", "BUF", "KC"])
	})
})

describe("statusLabel", () => {
	const row = (status: StandingsRow["status"]) => ({ status }) as StandingsRow

	it("names only byes and play-ins", () => {
		expect(statusLabel(row("bye"))).toBe("Bye")
		expect(statusLabel(row("playIn"))).toBe("Play-in")
		expect(statusLabel(row("playoff"))).toBeNull()
		expect(statusLabel(row("out"))).toBeNull()
		expect(statusLabel(row(null))).toBeNull()
	})
})

describe("changeNote", () => {
	const row = (wins: number | null, rebalancedFrom: number | null) =>
		({
			wins,
			team: {
				...conference("AFC", { East: { BUF: wins } })[0],
				rebalancedFrom,
			},
		}) as StandingsRow

	it("shows the saved pick while a draft has moved it", () => {
		expect(changeNote(row(9, null), { original: 11 })).toBe("was 11")
		expect(changeNote(row(11, 8), { original: 11 })).toBeNull()
	})

	it("shows where a saved rebalance started from", () => {
		expect(changeNote(row(9, 11), null)).toBe("rebalanced from 11")
		expect(changeNote(row(9, 9), null)).toBeNull()
		expect(changeNote(row(9, null), null)).toBeNull()
	})
})
