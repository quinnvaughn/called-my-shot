import { db } from "../../../db"
import type { TeamRecord } from "../../../db/schema"
import { builder } from "../../builder"

export const TeamRef = builder.drizzleObject("teams", {
	name: "Team",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		abbreviation: t.exposeString("abbreviation"),
		color: t.exposeString("color"),
		conference: t.exposeString("conference", { nullable: true }),
		division: t.exposeString("division", { nullable: true }),
		league: t.relation("league"),
	}),
})

// A team's win-loss(-tie) record as of the specific game it's attached to -
// see teamRecords in db/schema/teams.ts for why this lives keyed off a game
// rather than as a plain field on Team (a team has no single "current"
// record independent of which season/point in the season you're asking
// about).
export const TeamRecordRef = builder
	.objectRef<{
		wins: number
		losses: number
		ties: number
		otLosses: number | null
	}>("TeamRecord")
	.implement({
		fields: (t) => ({
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			ties: t.exposeInt("ties"),
			// The NHL's third count. Null for a league without overtime losses.
			otLosses: t.int({ nullable: true, resolve: (r) => r.otLosses }),
		}),
	})

// Shared load function behind GameRef.homeTeamRecord/awayTeamRecord below -
// each field still gets its own t.loadable (and so its own dataloader
// instance/cache), this just keeps the two batch queries from being two
// copies of the same code.
export async function loadTeamRecordsByKey(
	keys: readonly string[],
): Promise<(TeamRecord | null)[]> {
	const teamIds = [...new Set(keys.map((k) => k.split("|")[0]))]
	const rows = await db.query.teamRecords.findMany({
		where: { teamId: { in: teamIds } },
	})
	const byKey = new Map(rows.map((r) => [`${r.teamId}|${r.seasonId}`, r]))
	return keys.map((k) => byKey.get(k) ?? null)
}
