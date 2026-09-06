import { db } from "../index"
import { sports, stats, statToleranceTiers } from "../schema"

type SportRow = typeof sports.$inferSelect
type StatRow = typeof stats.$inferSelect

async function findOrCreateSport(
	name: string,
	slug: string,
): Promise<SportRow> {
	const existing = await db.query.sports.findFirst({ where: { slug } })
	if (existing) return existing
	const [row] = await db.insert(sports).values({ name, slug }).returning()
	if (!row) {
		throw new Error(`findOrCreateSport: insert returned nothing for ${slug}`)
	}
	return row
}

// One row per tolerance band a numeric_guess stat can point at - see
// statToleranceTiers' own doc comment in db/schema/stats.ts. Upserted by
// name, so tweaking a toleranceValue here and re-running the sync updates the
// live row instead of erroring on the unique constraint. The three "Rate
// Stat" tiers are absolute-mode (a fixed amount in the stat's own unit, not
// a fraction of it) - starting points for AVG/OBP/SLG/ERA/WHIP, tunable like
// any other tier.
const TOLERANCE_TIERS = [
	{
		name: "Low-Count Box Stat",
		toleranceMode: "percentage",
		toleranceValue: 0.15,
	},
	{ name: "High-Volume", toleranceMode: "percentage", toleranceValue: 0.1 },
	{
		name: "Rate Stat - Batting",
		toleranceMode: "absolute",
		toleranceValue: 0.02,
	},
	{ name: "Rate Stat - ERA", toleranceMode: "absolute", toleranceValue: 0.5 },
	{ name: "Rate Stat - WHIP", toleranceMode: "absolute", toleranceValue: 0.15 },
	// Season win-total guesses (team_season_stat_numeric_guess, statName
	// "Wins") - absolute-mode and sport-specific rather than the generic
	// "High-Volume" percentage tier, since a fixed win-count band scales with
	// how many games a season actually has (a 17-game NFL season can't take
	// the same ~10% band an 82-game NBA season can).
	{
		name: "Season Win Total - NBA",
		toleranceMode: "absolute",
		toleranceValue: 5,
	},
	{
		name: "Season Win Total - NFL",
		toleranceMode: "absolute",
		toleranceValue: 1,
	},
	{
		name: "Season Win Total - MLB",
		toleranceMode: "absolute",
		toleranceValue: 6,
	},
] as const

type AppliesTo = "player" | "team" | "both"
type StatEntry = readonly [
	name: string,
	category: string,
	tier: (typeof TOLERANCE_TIERS)[number]["name"],
	appliesTo: AppliesTo,
]

// The real stat catalog - every player/team box-score stat (and season
// aggregate like Wins) a question can be about. This is the one place it's
// defined; seed.ts and the standalone db:sync-catalog script both call
// syncStatCatalog below rather than inserting rows themselves, so adding a
// stat here is the only step needed to get it into dev and prod alike -
// no hand-written SQL against prod each time the catalog grows. See
// statAppliesTo in db/schema/stats.ts for what appliesTo means.
const BASKETBALL_STATS: StatEntry[] = [
	["Points", "Scoring", "High-Volume", "both"],
	["3-Pointers Made", "Scoring", "Low-Count Box Stat", "both"],
	["Rebounds", "Rebounding", "Low-Count Box Stat", "both"],
	["Assists", "Playmaking", "Low-Count Box Stat", "both"],
	["Turnovers", "Playmaking", "Low-Count Box Stat", "both"],
	["Steals", "Defense", "Low-Count Box Stat", "both"],
	["Blocks", "Defense", "Low-Count Box Stat", "both"],
	// Season-long, team-only in practice (no player "wins" a box score).
	["Wins", "Record", "Season Win Total - NBA", "team"],
]

const FOOTBALL_STATS: StatEntry[] = [
	// Team-only here (unlike basketball's, which is "both") - an NFL player
	// has no individual "Points" box-score line the way a team's final score
	// is one; credit shows up as TDs/FGs instead.
	["Points", "Scoring", "High-Volume", "team"],
	["Passing Yards", "Passing", "High-Volume", "both"],
	["Passing Touchdowns", "Passing", "Low-Count Box Stat", "both"],
	["Rushing Yards", "Rushing", "High-Volume", "both"],
	["Rushing Touchdowns", "Rushing", "Low-Count Box Stat", "both"],
	["Receiving Yards", "Receiving", "High-Volume", "both"],
	["Receptions", "Receiving", "Low-Count Box Stat", "both"],
	["Receiving Touchdowns", "Receiving", "Low-Count Box Stat", "both"],
	["Sacks", "Defense", "Low-Count Box Stat", "both"],
	["Interceptions", "Defense", "Low-Count Box Stat", "both"],
	// See BASKETBALL_STATS' "Wins" entry above - same reasoning.
	["Wins", "Record", "Season Win Total - NFL", "team"],
]

const BASEBALL_STATS: StatEntry[] = [
	["Hits", "Batting", "Low-Count Box Stat", "both"],
	["Home Runs", "Batting", "Low-Count Box Stat", "both"],
	["RBIs", "Batting", "Low-Count Box Stat", "both"],
	["Runs", "Batting", "Low-Count Box Stat", "both"],
	["Stolen Bases", "Batting", "Low-Count Box Stat", "both"],
	["Strikeouts (Batting)", "Batting", "Low-Count Box Stat", "both"],
	["Walks (Batting)", "Batting", "Low-Count Box Stat", "both"],
	["Batting Average", "Batting", "Rate Stat - Batting", "both"],
	["On-Base Percentage", "Batting", "Rate Stat - Batting", "both"],
	["Slugging Percentage", "Batting", "Rate Stat - Batting", "both"],
	["Saves", "Pitching", "Low-Count Box Stat", "both"],
	["Strikeouts (Pitching)", "Pitching", "High-Volume", "both"],
	["Earned Runs Allowed", "Pitching", "Low-Count Box Stat", "both"],
	["ERA", "Pitching", "Rate Stat - ERA", "both"],
	["WHIP", "Pitching", "Rate Stat - WHIP", "both"],
	// Season-long, team-only in practice - see BASKETBALL_STATS' "Wins" entry.
	["Wins", "Record", "Season Win Total - MLB", "team"],
]

type TierRow = typeof statToleranceTiers.$inferSelect

export type StatCatalog = {
	basketball: SportRow
	football: SportRow
	baseball: SportRow
	basketballStats: StatRow[]
	footballStats: StatRow[]
	baseballStats: StatRow[]
	toleranceTiers: TierRow[]
}

async function upsertStats(
	sport: SportRow,
	entries: StatEntry[],
	tierIdByName: Map<string, string>,
): Promise<StatRow[]> {
	const rows: StatRow[] = []
	for (const [
		index,
		[name, category, tierName, appliesTo],
	] of entries.entries()) {
		const toleranceTierId = tierIdByName.get(tierName)
		if (!toleranceTierId) {
			throw new Error(`syncStatCatalog: unknown tolerance tier "${tierName}"`)
		}
		const [row] = await db
			.insert(stats)
			.values({
				sportId: sport.id,
				name,
				category,
				toleranceTierId,
				appliesTo,
				sortOrder: index,
			})
			.onConflictDoUpdate({
				target: [stats.sportId, stats.name],
				set: { category, toleranceTierId, appliesTo, sortOrder: index },
			})
			.returning()
		if (!row) {
			throw new Error(
				`syncStatCatalog: upsert returned nothing for stat "${name}"`,
			)
		}
		rows.push(row)
	}
	return rows
}

// Idempotent - upserts sports, tolerance tiers, and every stat above by their
// natural unique keys (sport slug, tier name, (sportId, stat name)), so
// running this twice, or against a DB that already has some of this data, is
// always safe. Nothing here creates throwaway data, unlike seed.ts, so this
// is safe to run directly against prod (see db/catalog/run.ts).
export async function syncStatCatalog(): Promise<StatCatalog> {
	const basketball = await findOrCreateSport("Basketball", "basketball")
	const football = await findOrCreateSport("Football", "football")
	const baseball = await findOrCreateSport("Baseball", "baseball")

	const tierIdByName = new Map<string, string>()
	const tierRows: TierRow[] = []
	for (const tier of TOLERANCE_TIERS) {
		const [row] = await db
			.insert(statToleranceTiers)
			.values(tier)
			.onConflictDoUpdate({
				target: [statToleranceTiers.name],
				set: {
					toleranceMode: tier.toleranceMode,
					toleranceValue: tier.toleranceValue,
				},
			})
			.returning()
		if (!row) {
			throw new Error(
				`syncStatCatalog: upsert returned nothing for tier "${tier.name}"`,
			)
		}
		tierIdByName.set(row.name, row.id)
		tierRows.push(row)
	}

	const basketballStats = await upsertStats(
		basketball,
		BASKETBALL_STATS,
		tierIdByName,
	)
	const footballStats = await upsertStats(
		football,
		FOOTBALL_STATS,
		tierIdByName,
	)
	const baseballStats = await upsertStats(
		baseball,
		BASEBALL_STATS,
		tierIdByName,
	)

	return {
		basketball,
		football,
		baseball,
		basketballStats,
		footballStats,
		baseballStats,
		toleranceTiers: tierRows,
	}
}
