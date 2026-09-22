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
	// Team final scores, per league (statName "Points"). Absolute rather than
	// "High-Volume" because a band should scale with how much a score swings,
	// not how big it is: an NFL score swings by roughly 45% of its average and
	// an NBA score by ~11%, so no one percentage fits both. Each is sized so a
	// good guess hits about a third of the time, where a numeric guess breaks
	// even at its 0.5 loss rate (see LOSS_RATE_BY_SHAPE in
	// @called-my-shot/scoring). +/-3 is within a field goal.
	{
		name: "Team Score - NFL",
		toleranceMode: "absolute",
		toleranceValue: 3,
	},
	{
		name: "Team Score - NBA",
		toleranceMode: "absolute",
		toleranceValue: 6,
	},
] as const

type AppliesTo = "player" | "team" | "both"
// A plausible line for ONE GAME, split by subject kind - see the
// typicalPlayerLine/typicalTeamLine columns in db/schema/stats.ts. Only seeds
// the create-question line field; nothing resolves against it, so these are
// eyeballed league-average starting points, not sourced data. An omitted side
// means "no sensible default" and seeds nothing - always omit the side
// appliesTo excludes, and omit both for a season-only stat like "Wins" that
// has no per-game reading.
type TypicalLines = { player?: number; team?: number }
type TierName = (typeof TOLERANCE_TIERS)[number]["name"]
// teamTier overrides tier for team questions only - see teamToleranceTierId
// in db/schema/stats.ts. Omitted means team questions use tier.
type StatEntry = readonly [
	name: string,
	category: string,
	tier: TierName,
	appliesTo: AppliesTo,
	typical?: TypicalLines,
	teamTier?: TierName,
]

// The real stat catalog - every player/team box-score stat (and season
// aggregate like Wins) a question can be about. This is the one place it's
// defined; seed.ts and the standalone db:sync-catalog script both call
// syncStatCatalog below rather than inserting rows themselves, so adding a
// stat here is the only step needed to get it into dev and prod alike -
// no hand-written SQL against prod each time the catalog grows. See
// statAppliesTo in db/schema/stats.ts for what appliesTo means.
const BASKETBALL_STATS: StatEntry[] = [
	[
		"Points",
		"Scoring",
		"High-Volume",
		"both",
		{ player: 24.5, team: 112.5 },
		"Team Score - NBA",
	],
	[
		"3-Pointers Made",
		"Scoring",
		"Low-Count Box Stat",
		"both",
		{ player: 2.5, team: 12.5 },
	],
	[
		"Rebounds",
		"Rebounding",
		"Low-Count Box Stat",
		"both",
		{ player: 7.5, team: 43.5 },
	],
	[
		"Assists",
		"Playmaking",
		"Low-Count Box Stat",
		"both",
		{ player: 5.5, team: 26.5 },
	],
	[
		"Turnovers",
		"Playmaking",
		"Low-Count Box Stat",
		"both",
		{ player: 2.5, team: 13.5 },
	],
	[
		"Steals",
		"Defense",
		"Low-Count Box Stat",
		"both",
		{ player: 1.5, team: 7.5 },
	],
	[
		"Blocks",
		"Defense",
		"Low-Count Box Stat",
		"both",
		{ player: 0.5, team: 4.5 },
	],
	// Season-long, team-only in practice (no player "wins" a box score). No
	// typical line: it's the one stat with no per-game reading, and that column
	// is per-game only - see TypicalLines above.
	["Wins", "Record", "Season Win Total - NBA", "team"],
]

const FOOTBALL_STATS: StatEntry[] = [
	// Team-only here (unlike basketball's, which is "both") - an NFL player
	// has no individual "Points" box-score line the way a team's final score
	// is one; credit shows up as TDs/FGs instead.
	["Points", "Scoring", "Team Score - NFL", "team", { team: 22.5 }],
	[
		"Passing Yards",
		"Passing",
		"High-Volume",
		"both",
		{ player: 249.5, team: 239.5 },
	],
	[
		"Passing Touchdowns",
		"Passing",
		"Low-Count Box Stat",
		"both",
		{ player: 1.5, team: 1.5 },
	],
	[
		"Rushing Yards",
		"Rushing",
		"High-Volume",
		"both",
		{ player: 65.5, team: 115.5 },
	],
	[
		"Rushing Touchdowns",
		"Rushing",
		"Low-Count Box Stat",
		"both",
		{ player: 0.5, team: 1.5 },
	],
	// A back's yards from carries and catches together. Player-only: at team
	// level it's just total offense, which Passing Yards and Rushing Yards
	// already cover between them.
	[
		"Rushing + Receiving Yards",
		"Rushing",
		"High-Volume",
		"player",
		{ player: 79.5 },
	],
	[
		"Receiving Yards",
		"Receiving",
		"High-Volume",
		"both",
		{ player: 55.5, team: 239.5 },
	],
	[
		"Receptions",
		"Receiving",
		"Low-Count Box Stat",
		"both",
		{ player: 4.5, team: 21.5 },
	],
	[
		"Receiving Touchdowns",
		"Receiving",
		"Low-Count Box Stat",
		"both",
		{ player: 0.5, team: 1.5 },
	],
	[
		"Sacks",
		"Defense",
		"Low-Count Box Stat",
		"both",
		{ player: 0.5, team: 2.5 },
	],
	[
		"Interceptions",
		"Defense",
		"Low-Count Box Stat",
		"both",
		{ player: 0.5, team: 0.5 },
	],
	// See BASKETBALL_STATS' "Wins" entry above - same reasoning, including why
	// it carries no typical line.
	["Wins", "Record", "Season Win Total - NFL", "team"],
]

const BASEBALL_STATS: StatEntry[] = [
	["Hits", "Batting", "Low-Count Box Stat", "both", { player: 0.5, team: 8.5 }],
	[
		"Home Runs",
		"Batting",
		"Low-Count Box Stat",
		"both",
		{ player: 0.5, team: 1.5 },
	],
	["RBIs", "Batting", "Low-Count Box Stat", "both", { player: 0.5, team: 4.5 }],
	["Runs", "Batting", "Low-Count Box Stat", "both", { player: 0.5, team: 4.5 }],
	[
		"Stolen Bases",
		"Batting",
		"Low-Count Box Stat",
		"both",
		{ player: 0.5, team: 0.5 },
	],
	[
		"Strikeouts (Batting)",
		"Batting",
		"Low-Count Box Stat",
		"both",
		{ player: 0.5, team: 8.5 },
	],
	[
		"Walks (Batting)",
		"Batting",
		"Low-Count Box Stat",
		"both",
		{ player: 0.5, team: 3.5 },
	],
	[
		"Batting Average",
		"Batting",
		"Rate Stat - Batting",
		"both",
		{ player: 0.275, team: 0.255 },
	],
	[
		"On-Base Percentage",
		"Batting",
		"Rate Stat - Batting",
		"both",
		{ player: 0.335, team: 0.315 },
	],
	[
		"Slugging Percentage",
		"Batting",
		"Rate Stat - Batting",
		"both",
		{ player: 0.425, team: 0.405 },
	],
	[
		"Saves",
		"Pitching",
		"Low-Count Box Stat",
		"both",
		{ player: 0.5, team: 0.5 },
	],
	[
		"Strikeouts (Pitching)",
		"Pitching",
		"High-Volume",
		"both",
		{ player: 5.5, team: 8.5 },
	],
	[
		"Earned Runs Allowed",
		"Pitching",
		"Low-Count Box Stat",
		"both",
		{ player: 2.5, team: 4.5 },
	],
	["ERA", "Pitching", "Rate Stat - ERA", "both", { player: 3.85, team: 4.05 }],
	[
		"WHIP",
		"Pitching",
		"Rate Stat - WHIP",
		"both",
		{ player: 1.225, team: 1.285 },
	],
	// Season-long, team-only in practice - see BASKETBALL_STATS' "Wins" entry,
	// including why it carries no typical line.
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
		[name, category, tierName, appliesTo, typical, teamTierName],
	] of entries.entries()) {
		const toleranceTierId = tierIdByName.get(tierName)
		if (!toleranceTierId) {
			throw new Error(`syncStatCatalog: unknown tolerance tier "${tierName}"`)
		}
		// null rather than undefined for the same reason as the typical lines
		// below: dropping a teamTier from an entry has to clear the column.
		const teamToleranceTierId = teamTierName
			? (tierIdByName.get(teamTierName) ?? null)
			: null
		if (teamTierName && !teamToleranceTierId) {
			throw new Error(
				`syncStatCatalog: unknown tolerance tier "${teamTierName}"`,
			)
		}
		// null rather than undefined so dropping a typical line from an entry
		// above actually clears the column on the next sync, instead of leaving
		// the stale value in place.
		const typicalPlayerLine = typical?.player ?? null
		const typicalTeamLine = typical?.team ?? null
		const [row] = await db
			.insert(stats)
			.values({
				sportId: sport.id,
				name,
				category,
				toleranceTierId,
				teamToleranceTierId,
				appliesTo,
				sortOrder: index,
				typicalPlayerLine,
				typicalTeamLine,
			})
			.onConflictDoUpdate({
				target: [stats.sportId, stats.name],
				set: {
					category,
					toleranceTierId,
					teamToleranceTierId,
					appliesTo,
					sortOrder: index,
					typicalPlayerLine,
					typicalTeamLine,
				},
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
