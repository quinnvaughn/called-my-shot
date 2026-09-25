import { db } from "../../db"

// Each "teamId|seasonId" key's playoff seed, from that team's latest standings
// reading of the season that carries one - see teamSeasonStats.playoffSeed.
// Null for a key with no reading.
export async function loadPlayoffSeeds(
	keys: readonly string[],
): Promise<(number | null)[]> {
	const pairs = keys.map((key) => key.split("|") as [string, string])
	const teamIds = [...new Set(pairs.map(([teamId]) => teamId))]
	const seasonIds = [...new Set(pairs.map(([, seasonId]) => seasonId))]
	const rows = teamIds.length
		? await db.query.teamSeasonStats.findMany({
				where: {
					teamId: { in: teamIds },
					seasonId: { in: seasonIds },
					playoffSeed: { isNotNull: true },
				},
				columns: { teamId: true, seasonId: true, playoffSeed: true },
				orderBy: { asOf: "desc" },
			})
		: []
	const seedByKey = new Map<string, number>()
	for (const row of rows) {
		const key = `${row.teamId}|${row.seasonId}`
		if (!seedByKey.has(key) && row.playoffSeed !== null) {
			seedByKey.set(key, row.playoffSeed)
		}
	}
	return keys.map((key) => seedByKey.get(key) ?? null)
}
