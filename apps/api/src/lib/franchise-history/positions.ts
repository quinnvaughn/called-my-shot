import { and, eq, inArray } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../../db"
import {
	externalRefs,
	playerFranchiseStints,
	players,
	teams,
} from "../../db/schema"
import type { HistoryLeague } from "./franchise-map"
import type { Log } from "./types"
import { sparql } from "./wikidata"

// Fills player_franchise_stints.positions: what each player played, as the
// league's codes in RUSHMORE_POSITIONS (@called-my-shot/schemas), so a prompt
// narrowed to positions can filter its pool on them.
//
// Every source names positions its own way (nflverse's OLB and FS,
// statsapi's LF and RP, the NHL's L and R), so each league maps the tokens it
// has seen onto its codes; a token it doesn't know maps to nothing. The NBA's
// sources only say guard, forward or center, so its positions come from
// Wikidata instead, which has point guard, shooting guard and the rest,
// falling back to the coarse one.

const TOKENS: Record<HistoryLeague, Record<string, readonly string[]>> = {
	nba: {
		PG: ["PG"],
		SG: ["SG"],
		SF: ["SF"],
		PF: ["PF"],
		C: ["C"],
		G: ["PG", "SG"],
		F: ["SF", "PF"],
	},
	mlb: {
		P: ["P"],
		SP: ["P"],
		RP: ["P"],
		TWP: ["P", "DH"],
		C: ["C"],
		"1B": ["1B"],
		"2B": ["2B"],
		"3B": ["3B"],
		SS: ["SS"],
		OF: ["OF"],
		LF: ["OF"],
		CF: ["OF"],
		RF: ["OF"],
		DH: ["DH"],
	},
	nfl: {
		QB: ["QB"],
		RB: ["RB"],
		HB: ["RB"],
		FB: ["RB"],
		WR: ["WR"],
		TE: ["TE"],
		OL: ["OL"],
		OT: ["OL"],
		T: ["OL"],
		OG: ["OL"],
		G: ["OL"],
		C: ["OL"],
		DL: ["DL"],
		DT: ["DL"],
		DE: ["DL"],
		NT: ["DL"],
		LB: ["LB"],
		OLB: ["LB"],
		ILB: ["LB"],
		MLB: ["LB"],
		DB: ["DB"],
		CB: ["DB"],
		S: ["DB"],
		SS: ["DB"],
		FS: ["DB"],
		K: ["K"],
		PK: ["K"],
		P: ["K"],
		LS: ["K"],
	},
	nhl: {
		C: ["C"],
		L: ["LW"],
		LW: ["LW"],
		R: ["RW"],
		RW: ["RW"],
		D: ["D"],
		G: ["G"],
	},
}

// A source's position ("G-F", "OLB", "LF") as the league's codes.
export function leaguePositions(
	league: HistoryLeague,
	raw: string | null,
): string[] {
	if (!raw) return []
	const tokens = raw.toUpperCase().split(/[\s,/-]+/)
	return orderedUnion(tokens.map((token) => TOKENS[league][token] ?? []))
}

// Wikidata's English names for the positions basketball players are listed
// at (P413), as NBA codes. Hybrids count as both.
const NBA_WIKIDATA: Record<string, readonly string[]> = {
	"point guard": ["PG"],
	"shooting guard": ["SG"],
	"small forward": ["SF"],
	"power forward": ["PF"],
	center: ["C"],
	centre: ["C"],
	guard: ["PG", "SG"],
	"combo guard": ["PG", "SG"],
	swingman: ["SG", "SF"],
	forward: ["SF", "PF"],
	"point forward": ["SF"],
	"stretch four": ["PF"],
	"forward-center": ["PF", "C"],
	"forward–center": ["PF", "C"],
	"guard-forward": ["SG", "SF"],
	"guard–forward": ["SG", "SF"],
}

export function nbaWikidataPositions(labels: string[]): string[] {
	return orderedUnion(
		labels.map((label) => NBA_WIKIDATA[label.trim().toLowerCase()] ?? []),
	)
}

function orderedUnion(lists: (readonly string[])[]): string[] {
	return [...new Set(lists.flat())]
}

// Every NBA player Wikidata lists positions for, by bare bref id.
async function loadNbaWikidataPositions(): Promise<Map<string, string[]>> {
	const rows = await sparql(`SELECT ?bref ?posLabel WHERE {
		?p wdt:P2685 ?bref ; wdt:P413 ?pos .
		?pos rdfs:label ?posLabel .
		FILTER(LANG(?posLabel) = "en")
	}`)
	const labels = new Map<string, string[]>()
	for (const row of rows) {
		const brefId = row.bref?.split("/").pop()
		if (!brefId || !row.posLabel) continue
		labels.set(brefId, [...(labels.get(brefId) ?? []), row.posLabel])
	}
	return new Map(
		[...labels].map(([brefId, names]) => [brefId, nbaWikidataPositions(names)]),
	)
}

const UPDATE_CHUNK = 1_000

// Rewrites one league's stint positions from what's known now. Cheap enough
// to run after every ingest; only stints whose positions changed are written.
export async function refreshStintPositions(
	league: HistoryLeague,
	log: Log,
): Promise<void> {
	const leagueRow = await db.query.leagues.findFirst({
		where: { slug: league },
		columns: { id: true },
	})
	if (!leagueRow) throw new Error(`No league with slug ${league}`)

	const rows = await db
		.select({
			id: playerFranchiseStints.id,
			current: playerFranchiseStints.positions,
			raw: players.position,
			brefId: externalRefs.sourceId,
		})
		.from(playerFranchiseStints)
		.innerJoin(teams, eq(teams.id, playerFranchiseStints.teamId))
		.innerJoin(players, eq(players.id, playerFranchiseStints.playerId))
		.leftJoin(
			externalRefs,
			and(
				eq(externalRefs.source, "bref"),
				eq(externalRefs.entityType, "player"),
				eq(externalRefs.entityId, players.id),
			),
		)
		.where(eq(teams.leagueId, leagueRow.id))

	const detailed = await match(league)
		.with("nba", () => loadNbaWikidataPositions())
		.otherwise(async () => new Map<string, string[]>())
	if (league === "nba")
		log(`nba: ${detailed.size} players with Wikidata positions`)

	// Stint ids to write, grouped by the positions they get.
	const byPositions = new Map<string, string[]>()
	let none = 0
	for (const row of rows) {
		const fromWikidata = row.brefId ? detailed.get(row.brefId) : undefined
		const positions =
			fromWikidata && fromWikidata.length > 0
				? fromWikidata
				: leaguePositions(league, row.raw)
		if (positions.length === 0) none++
		const key = positions.join(",")
		if (key === row.current.join(",")) continue
		byPositions.set(key, [...(byPositions.get(key) ?? []), row.id])
	}

	let written = 0
	for (const [key, ids] of byPositions) {
		const positions = key ? key.split(",") : []
		for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
			const chunk = ids.slice(i, i + UPDATE_CHUNK)
			await db
				.update(playerFranchiseStints)
				.set({ positions })
				.where(inArray(playerFranchiseStints.id, chunk))
			written += chunk.length
		}
	}
	log(
		`${league}: ${written} of ${rows.length} stints' positions changed; ${none} have none`,
	)
}
