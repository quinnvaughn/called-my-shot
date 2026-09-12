import { builder } from "../../builder"
import { StatAppliesTo, ToleranceMode } from "./enums"

export const PlayerRef = builder.drizzleObject("players", {
	name: "Player",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		position: t.exposeString("position", { nullable: true }),
		// Every position this player is ESPN-eligible at, used for award-pool
		// eligibility (see questions.awardPositions) - distinct from `position`
		// above, which is just their single current/primary tag.
		positions: t.field({ type: ["String"], resolve: (p) => p.positions }),
		// null for free agents/retired players, not every player is on a team
		currentTeam: t.relation("currentTeam", { nullable: true }),
		seasonsInLeague: t.exposeInt("seasonsInLeague"),
		// Real rookie-of-the-year eligibility for the current season, per this
		// player's sport's own rule - see players.rookieEligible's comment in
		// db/schema/players.ts for why this isn't just seasonsInLeague === 0.
		rookieEligible: t.exposeBoolean("rookieEligible"),
	}),
})

export const StatToleranceTierRef = builder.drizzleObject(
	"statToleranceTiers",
	{
		name: "StatToleranceTier",
		fields: (t) => ({
			id: t.exposeID("id"),
			name: t.exposeString("name"),
			toleranceMode: t.field({
				type: ToleranceMode,
				resolve: (tier) => tier.toleranceMode,
			}),
			toleranceValue: t.exposeFloat("toleranceValue"),
		}),
	},
)

export const StatRef = builder.drizzleObject("stats", {
	name: "Stat",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		category: t.exposeString("category"),
		sortOrder: t.exposeInt("sortOrder"),
		appliesTo: t.field({ type: StatAppliesTo, resolve: (s) => s.appliesTo }),
		// Nullable, so t.float rather than exposeFloat - a stat with no
		// sensible default line seeds the create form with nothing instead of
		// a misleading number. See db/schema/stats.ts for what these measure.
		typicalPlayerLine: t.float({
			nullable: true,
			resolve: (s) => s.typicalPlayerLine,
		}),
		typicalTeamLine: t.float({
			nullable: true,
			resolve: (s) => s.typicalTeamLine,
		}),
		sport: t.relation("sport"),
		toleranceTier: t.relation("toleranceTier"),
	}),
})
