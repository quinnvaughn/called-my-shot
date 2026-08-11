import { db } from "../../db"
import { builder } from "../builder"

export const SportRef = builder.drizzleObject("sports", {
	name: "Sport",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		slug: t.exposeString("slug"),
		leagues: t.relation("leagues"),
	}),
})

export const LeagueRef = builder.drizzleObject("leagues", {
	name: "League",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		abbreviation: t.exposeString("abbreviation"),
		slug: t.exposeString("slug"),
		sport: t.relation("sport"),
		teams: t.relation("teams"),
	}),
})

export const TeamRef = builder.drizzleObject("teams", {
	name: "Team",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		abbreviation: t.exposeString("abbreviation"),
		color: t.exposeString("color"),
		league: t.relation("league"),
	}),
})

export const PlayerRef = builder.drizzleObject("players", {
	name: "Player",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		position: t.exposeString("position", { nullable: true }),
		// null for free agents/retired players, not every player is on a team
		currentTeam: t.relation("currentTeam", { nullable: true }),
	}),
})

export const StatRef = builder.drizzleObject("stats", {
	name: "Stat",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		category: t.exposeString("category"),
		sortOrder: t.exposeInt("sortOrder"),
		sport: t.relation("sport"),
	}),
})

builder.queryFields((t) => ({
	sports: t.field({
		type: [SportRef],
		resolve: () => db.query.sports.findMany({ orderBy: { name: "asc" } }),
	}),

	leagues: t.field({
		type: [LeagueRef],
		args: { sportId: t.arg.id({ required: false }) },
		resolve: (_root, args) =>
			db.query.leagues.findMany({
				where: args.sportId ? { sportId: args.sportId } : undefined,
				orderBy: { name: "asc" },
			}),
	}),

	teams: t.field({
		type: [TeamRef],
		args: { leagueId: t.arg.id({ required: false }) },
		resolve: (_root, args) =>
			db.query.teams.findMany({
				where: args.leagueId ? { leagueId: args.leagueId } : undefined,
				orderBy: { name: "asc" },
			}),
	}),

	players: t.field({
		type: [PlayerRef],
		args: { teamId: t.arg.id({ required: false }) },
		resolve: (_root, args) =>
			db.query.players.findMany({
				where: args.teamId ? { currentTeamId: args.teamId } : undefined,
				orderBy: { name: "asc" },
			}),
	}),

	// scoped to a sport, not a league - see the Stat type doc
	stats: t.field({
		type: [StatRef],
		args: { sportId: t.arg.id({ required: true }) },
		resolve: (_root, args) =>
			db.query.stats.findMany({
				where: { sportId: args.sportId },
				orderBy: { sortOrder: "asc" },
			}),
	}),
}))
