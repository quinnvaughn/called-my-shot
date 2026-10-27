import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { parseCsv } from "./csv"
import {
	MLB_FRANCHISES,
	NBA_FRANCHISES,
	nflFranchiseTeam,
	nhlFranchiseTeam,
} from "./franchise-map"
import { parseMlbRoster, parseWarFile, warTeamFranchises } from "./mlb"
import {
	decodeEntities,
	nbaScore,
	parseBrefFranchisePlayers,
	parseBrefFranchiseSeasons,
	parseBrefHallOfFame,
	parseBrefSeasonTotals,
} from "./nba"
import { isNflHallOfFamer, nflPeople, parseNflRoster } from "./nfl"
import {
	type NhlCareerRow,
	nhlStints,
	nhlTeamSeasons,
	seasonEndYear,
} from "./nhl"

const fixture = (name: string) =>
	readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8")

describe("franchise maps", () => {
	it("covers every current team once", () => {
		expect(new Set(Object.values(NBA_FRANCHISES)).size).toBe(30)
		expect(new Set(Object.values(MLB_FRANCHISES)).size).toBe(30)
	})

	it("sends the original Winnipeg Jets to the Coyotes' lineage, not today's Jets", () => {
		expect(nhlFranchiseTeam(35, "WIN")).toBeNull()
		expect(nhlFranchiseTeam(28, "PHX,ARI")).toBeNull()
		expect(nhlFranchiseTeam(35, "ATL")).toBe("WPG")
		expect(nhlFranchiseTeam(35, "ATL,WPG")).toBe("WPG")
		expect(nhlFranchiseTeam(35, "WIN,ATL")).toBe("WPG")
		expect(nhlFranchiseTeam(40, "UTA")).toBe("UTAH")
		// The Montreal Maroons folded.
		expect(nhlFranchiseTeam(7, "MMR")).toBeNull()
	})

	it("splits BAL into the Colts and the Ravens by season", () => {
		expect(nflFranchiseTeam("BAL", 1948)).toBeNull()
		expect(nflFranchiseTeam("BAL", 1950)).toBeNull()
		expect(nflFranchiseTeam("BAL", 1953)).toBe("IND")
		expect(nflFranchiseTeam("BAL", 1983)).toBe("IND")
		expect(nflFranchiseTeam("BAL", 1996)).toBe("BAL")
		expect(nflFranchiseTeam("BLT", 2010)).toBe("BAL")
	})

	it("follows relocations and drops folded teams and the AAFC", () => {
		expect(nflFranchiseTeam("CLE", 1922)).toBeNull()
		expect(nflFranchiseTeam("CLE", 1940)).toBe("LAR")
		expect(nflFranchiseTeam("CLE", 1947)).toBeNull()
		expect(nflFranchiseTeam("CLE", 1955)).toBe("CLE")
		expect(nflFranchiseTeam("SF", 1948)).toBeNull()
		expect(nflFranchiseTeam("SF", 1951)).toBe("SF")
		expect(nflFranchiseTeam("DET", 1925)).toBeNull()
		expect(nflFranchiseTeam("POR", 1932)).toBe("DET")
		expect(nflFranchiseTeam("KC", 1925)).toBeNull()
		expect(nflFranchiseTeam("TEX", 1961)).toBe("KC")
		expect(nflFranchiseTeam("LA", 1926)).toBeNull()
		expect(nflFranchiseTeam("LA", 1955)).toBe("LAR")
		expect(nflFranchiseTeam("STL", 1965)).toBe("ARI")
		expect(nflFranchiseTeam("STL", 1999)).toBe("LAR")
		expect(nflFranchiseTeam("HOU", 1965)).toBe("TEN")
		expect(nflFranchiseTeam("HOU", 2020)).toBe("HOU")
		expect(nflFranchiseTeam("BOS", 1935)).toBe("WSH")
		expect(nflFranchiseTeam("BOS", 1965)).toBe("NE")
		expect(nflFranchiseTeam("CHR", 1960)).toBe("LAC")
		expect(nflFranchiseTeam("NY", 1921)).toBeNull()
		expect(nflFranchiseTeam("P-P", 1943)).toBeNull()
		// Pro-Football-Reference's codes, from the draft table.
		expect(nflFranchiseTeam("GNB", 1990)).toBe("GB")
	})
})

describe("Basketball-Reference", () => {
	it("reads a franchise's players page", () => {
		const rows = parseBrefFranchisePlayers(fixture("bref-bos-players.html"))
		expect(rows.map((row) => row.brefId).sort()).toEqual([
			"abdelal01",
			"birdla01",
			"cousybo01",
			"russebi01",
		])
		expect(rows.find((row) => row.brefId === "russebi01")).toEqual({
			brefId: "russebi01",
			name: "Bill Russell",
			from: 1957,
			to: 1969,
			years: 13,
			games: 963,
			points: 14522,
			rebounds: 21620,
			assists: 4100,
		})
	})

	it("counts only Player inductions as Hall of Famers", () => {
		const hof = parseBrefHallOfFame(fixture("bref-hof.html"))
		expect([...hof].sort()).toEqual(["birdla01", "russebi01"])
	})

	it("ranks a rebounder alongside scorers", () => {
		const rows = parseBrefFranchisePlayers(fixture("bref-bos-players.html"))
		const score = (id: string) =>
			nbaScore(rows.find((row) => row.brefId === id) as never, true)
		expect(score("russebi01")).toBeGreaterThan(score("cousybo01"))
	})

	it("reads which code each of a franchise's seasons was played under", () => {
		expect(
			parseBrefFranchiseSeasons(fixture("bref-okc-franchise.html")),
		).toEqual([
			{ code: "OKC", season: 2009, league: "NBA" },
			{ code: "SEA", season: 2008, league: "NBA" },
			{ code: "SEA", season: 1968, league: "NBA" },
		])
	})

	it("reads a row per team from a season's totals, skipping combined rows and the playoffs", () => {
		const rows = parseBrefSeasonTotals(fixture("bref-nba-2005-totals.html"))
		expect(rows).toEqual([
			{ brefId: "iversal01", code: "PHI" },
			{ brefId: "cartevi01", code: "TOR" },
			{ brefId: "cartevi01", code: "NJN" },
			{ brefId: "allenra02", code: "SEA" },
		])
	})

	it("decodes entities in names", () => {
		expect(decodeEntities("Shaquille O&#39;Neal &amp; Co")).toBe(
			"Shaquille O'Neal & Co",
		)
	})
})

describe("MLB", () => {
	it("reads a statsapi roster", () => {
		const roster = parseMlbRoster(
			JSON.parse(fixture("mlb-nyy-1927-roster.json")),
		)
		expect(roster).toContainEqual({
			id: "121578",
			name: "Babe Ruth",
			position: expect.any(String),
		})
	})

	it("reads WAR rows and skips ones without an MLBAM id", () => {
		const bat = parseWarFile(fixture("war-bat.txt"))
		expect(bat.map((row) => row.mlbamId)).not.toContain("NULL")
		expect(
			bat.find((row) => row.year === 1927 && row.mlbamId === "121578"),
		).toMatchObject({ teamCode: "NYY", games: 151, name: "Babe Ruth" })
	})

	it("assigns each bref team-season to the franchise most of its players were rostered by", () => {
		const rows = parseWarFile(fixture("war-bat.txt"))
		const memberships = new Map([
			["121578:1919", new Set(["111"])],
			["121578:1920", new Set(["147"])],
			["121578:1927", new Set(["147"])],
			["114680:1927", new Set(["147"])],
		])
		const franchises = warTeamFranchises(rows, memberships)
		expect(franchises.get("BOS:1919")).toBe("111")
		expect(franchises.get("NYY:1927")).toBe("147")
	})
})

describe("NHL", () => {
	const rows = [
		...JSON.parse(fixture("nhl-f35-skaters.json")).data,
		...JSON.parse(fixture("nhl-f12-goalies.json")).data,
	] as NhlCareerRow[]

	it("files Atlanta and Winnipeg under the Jets and drops the original Jets", () => {
		const stints = nhlStints(rows, { hallOfFame: new Set(), top100: new Set() })
		const teamOf = (id: number) =>
			stints.get(id)?.stints.map((stint) => stint.teamAbbreviation)
		expect(teamOf(8444923)).toBeUndefined() // WIN only
		expect(teamOf(8446053)).toEqual(["WPG"]) // ATL
		expect(teamOf(8475159)).toEqual(["WPG"]) // ATL,WPG
		expect(teamOf(8451673)).toEqual(["WPG"]) // WIN,ATL
	})

	it("uses season-end years and adds the Hall of Fame bonus", () => {
		const chelios = rows.find((row) => row.playerId === 8446053) as NhlCareerRow
		const plain = nhlStints([chelios], {
			hallOfFame: new Set(),
			top100: new Set(),
		})
		const hof = nhlStints([chelios], {
			hallOfFame: new Set([8446053]),
			top100: new Set(),
		})
		const stint = hof.get(8446053)?.stints[0]
		expect(stint?.firstSeason).toBe(
			seasonEndYear(chelios.firstSeasonForGameType),
		)
		expect(stint?.hallOfFame).toBe(true)
		expect(
			(stint?.score ?? 0) - (plain.get(8446053)?.stints[0]?.score ?? 0),
		).toBe(500)
	})

	it("reads goalie rows", () => {
		const stints = nhlStints(rows, { hallOfFame: new Set(), top100: new Set() })
		const goalie = rows.find((row) => row.franchiseId === 12) as NhlCareerRow
		expect(stints.get(goalie.playerId)?.stints[0]?.teamAbbreviation).toBe("DET")
	})
})

describe("NHL seasons", () => {
	it("gives a traded player a season with each team and drops the original Jets", () => {
		const seasons = nhlTeamSeasons(
			JSON.parse(fixture("nhl-season-skaters.json")).data,
			JSON.parse(fixture("nhl-teams.json")).data,
		)
		expect(seasons.get(8447364)).toEqual([
			{ teamAbbreviation: "NYR", season: 1998 },
		])
		expect(seasons.get(8459174)).toEqual([
			{ teamAbbreviation: "EDM", season: 1998 },
			{ teamAbbreviation: "PHI", season: 1998 },
		])
		// WIN,ANA: the Winnipeg half belongs to the Coyotes' lineage.
		expect(seasons.get(8457981)).toEqual([
			{ teamAbbreviation: "ANA", season: 1996 },
		])
	})
})

describe("nflverse", () => {
	const rows = [
		...parseNflRoster(fixture("nfl-roster-1948.csv")),
		...parseNflRoster(fixture("nfl-roster-1960.csv")),
		...parseNflRoster(fixture("nfl-roster-2010.csv")),
	]

	it("parses quoted CSV fields", () => {
		expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([
			{ a: "x, y", b: 'say "hi"' },
		])
	})

	it("files the 1953-83 Colts under Indianapolis and drops the AAFC Browns", () => {
		const people = nflPeople(rows)
		const unitas = people.get("johnny unitas|1933-05-07")
		expect([...(unitas?.seasons.keys() ?? [])]).toEqual(["IND"])
		expect(people.get("otto graham|1921-12-06")).toBeUndefined()
		expect([
			...(people.get("emlen tunnell|1925-03-29")?.seasons.keys() ?? []),
		]).toEqual(["NYG"])
		expect([
			...(people.get("bob garner|1935-01-01")?.seasons.keys() ?? []),
		]).toEqual(["LAC"])
	})

	it("keys a player by GSIS id once one of his rows has it", () => {
		const early = { ...rows.find((row) => row.name === "Peyton Manning") }
		const people = nflPeople([
			...rows,
			{ ...early, season: 1998, gsisId: "" } as (typeof rows)[number],
		])
		const manning = [...people.values()].filter(
			(person) => person.name === "Peyton Manning",
		)
		expect(manning).toHaveLength(1)
		expect(manning[0]?.key).toBe(early.gsisId)
		expect(manning[0]?.seasons.get("IND")).toEqual(new Set([1998, 2010]))
	})

	it("matches a Hall of Famer without a PFR id by birth date and surname", () => {
		const unitas = nflPeople(rows).get("johnny unitas|1933-05-07")
		if (!unitas) throw new Error("no Unitas")
		const byBirth = new Map([
			[
				"1933-05-07",
				[{ pfrId: "UnitJo00", name: "Johnny Unitas", birthDate: "1933-05-07" }],
			],
		])
		expect(isNflHallOfFamer(unitas, new Set(), byBirth)).toBe(true)
		expect(isNflHallOfFamer(unitas, new Set(), new Map())).toBe(false)
	})
})
