import {
	createGameSchema,
	createLeagueSchema,
	createPlayerSchema,
	createTeamSchema,
	updateGameSchema,
	updateLeagueSchema,
	updatePlayerSchema,
	updateTeamSchema,
} from "@called-my-shot/schemas"
import { asc, eq, getColumns } from "drizzle-orm"
import { db } from "../../db"
import type { Game, League, Player, Team } from "../../db/schema"
import { games, leagues, players, teams } from "../../db/schema"
import {
	type AdminConnection,
	buildAdminConnection,
	clampAdminPageSize,
	SortDirection,
	sortColumn,
} from "../../lib/admin-pagination"
import { requireAdmin } from "../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../lib/errors"
import { decodeOffsetCursor } from "../../lib/pagination"
import { builder } from "../builder"
import { PageInfoRef } from "./pagination"

const LeagueStatus = builder.enumType("LeagueStatus", {
	values: {
		ACTIVE: { value: "active" },
		INACTIVE: { value: "inactive" },
	},
})

const GameStatus = builder.enumType("GameStatus", {
	values: {
		SCHEDULED: { value: "scheduled" },
		LIVE: { value: "live" },
		FINAL: { value: "final" },
	},
})

const StatAppliesTo = builder.enumType("StatAppliesTo", {
	values: {
		PLAYER: { value: "player" },
		TEAM: { value: "team" },
		BOTH: { value: "both" },
	},
})

const AdminLeagueSort = builder.enumType("AdminLeagueSort", {
	values: { NAME: { value: "name" }, STATUS: { value: "status" } },
})
const AdminTeamSort = builder.enumType("AdminTeamSort", {
	values: { NAME: { value: "name" }, ABBREVIATION: { value: "abbreviation" } },
})
const AdminPlayerSort = builder.enumType("AdminPlayerSort", {
	values: { NAME: { value: "name" }, POSITION: { value: "position" } },
})
const AdminGameSort = builder.enumType("AdminGameSort", {
	values: { STARTS_AT: { value: "startsAt" }, STATUS: { value: "status" } },
})

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
		status: t.field({ type: LeagueStatus, resolve: (l) => l.status }),
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

export const GameRef = builder.drizzleObject("games", {
	name: "Game",
	fields: (t) => ({
		id: t.exposeID("id"),
		startsAt: t.field({
			type: "String",
			resolve: (g) => g.startsAt.toISOString(),
		}),
		status: t.field({ type: GameStatus, resolve: (g) => g.status }),
		homeScore: t.exposeInt("homeScore", { nullable: true }),
		awayScore: t.exposeInt("awayScore", { nullable: true }),
		league: t.relation("league"),
		homeTeam: t.relation("homeTeam"),
		awayTeam: t.relation("awayTeam"),
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

export const StatToleranceTierRef = builder.drizzleObject(
	"statToleranceTiers",
	{
		name: "StatToleranceTier",
		fields: (t) => ({
			id: t.exposeID("id"),
			name: t.exposeString("name"),
			tolerancePct: t.exposeFloat("tolerancePct"),
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
		sport: t.relation("sport"),
		toleranceTier: t.relation("toleranceTier"),
	}),
})

const AdminLeagueConnectionRef = builder
	.objectRef<AdminConnection<League>>("AdminLeagueConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [LeagueRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

const AdminTeamConnectionRef = builder
	.objectRef<AdminConnection<Team>>("AdminTeamConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [TeamRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

const AdminPlayerConnectionRef = builder
	.objectRef<AdminConnection<Player>>("AdminPlayerConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [PlayerRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

const AdminGameConnectionRef = builder
	.objectRef<AdminConnection<Game>>("AdminGameConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [GameRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
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

	// The Data tab's league detail page header - not admin-gated, a league's
	// name isn't sensitive (same reasoning as the plain `leagues` list above).
	league: t.field({
		type: LeagueRef,
		nullable: true,
		args: { id: t.arg.id({ required: true }) },
		resolve: (_root, args) =>
			db.query.leagues.findFirst({ where: { id: args.id } }),
	}),

	// Single-game lookup, same reasoning as `league` above - lets the
	// create-question form's game field redisplay its current selection from
	// just the stored gameId after its own component remounts (switching
	// question type re-mounts the section it lives in), without keeping a
	// second, ephemeral copy of the game's data in local component state.
	game: t.field({
		type: GameRef,
		nullable: true,
		args: { id: t.arg.id({ required: true }) },
		resolve: (_root, args) =>
			db.query.games.findFirst({ where: { id: args.id } }),
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
		args: {
			teamId: t.arg.id({ required: false }),
			leagueId: t.arg.id({ required: false }),
		},
		resolve: (_root, args) =>
			db.query.players.findMany({
				where: {
					...(args.teamId ? { currentTeamId: args.teamId } : {}),
					...(args.leagueId
						? { currentTeam: { leagueId: args.leagueId } }
						: {}),
				},
				orderBy: { name: "asc" },
			}),
	}),

	// Public, not admin-gated - same reasoning as teams/players above. Backs
	// the create-question form's game picker: scoped to a league and to
	// upcoming scheduled games only (nothing already live/final makes sense to
	// attach a new question to), with an optional free-text match against
	// either team's name/abbreviation to narrow down a league's full slate.
	// Deliberately not the admin/adminGames cursor-paginated connection - this
	// is a bounded typeahead result set, not something a caller pages through.
	games: t.field({
		type: [GameRef],
		args: {
			leagueId: t.arg.id({ required: true }),
			query: t.arg.string({ required: false }),
			first: t.arg.int({ required: false }),
		},
		resolve: (_root, args) => {
			const limit = Math.min(Math.max(args.first ?? 8, 1), 20)
			// Split into per-team search tokens rather than matching the raw
			// string as one substring - "denver boston"/"denver vs boston"
			// should find Denver @ Boston (or Boston @ Denver) even though no
			// single team is named "Denver Boston". Each token must match SOME
			// team (home or away, name or abbreviation) - that's the OR inside
			// each token's clause - but every token has to match something,
			// which is the AND across tokens below.
			const tokens = (args.query ?? "")
				.split(/\s+/)
				.map((t) => t.trim())
				.filter(
					(t) =>
						t.length > 0 && !["vs", "v", "at", "@"].includes(t.toLowerCase()),
				)
			return db.query.games.findMany({
				where: {
					leagueId: args.leagueId,
					status: "scheduled",
					startsAt: { gt: new Date() },
					...(tokens.length > 0
						? {
								AND: tokens.map((token) => ({
									OR: [
										{ homeTeam: { name: { ilike: `%${token}%` } } },
										{ homeTeam: { abbreviation: { ilike: `%${token}%` } } },
										{ awayTeam: { name: { ilike: `%${token}%` } } },
										{ awayTeam: { abbreviation: { ilike: `%${token}%` } } },
									],
								})),
							}
						: {}),
				},
				orderBy: { startsAt: "asc" },
				limit,
			})
		},
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

	// Data tab's own league list - the entry point admins pick a league from
	// before drilling into that league's teams/players/games (see
	// adminTeams/adminPlayers/adminGames below, all league-scoped for exactly
	// that reason).
	adminLeagues: t.field({
		type: AdminLeagueConnectionRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			first: t.arg.int({ required: false }),
			after: t.arg.string({ required: false }),
			sortBy: t.arg({ type: AdminLeagueSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = clampAdminPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sortDir = args.sortDir ?? "asc"
			const column = args.sortBy === "status" ? leagues.status : leagues.name

			const rows = await db
				.select()
				.from(leagues)
				.orderBy(sortColumn(sortDir, column), asc(leagues.id))
				.limit(limit + 1)
				.offset(offset)
			return buildAdminConnection(rows, limit, offset)
		},
	}),

	// League-scoped - picking a league on the Data tab is what surfaces this
	// (see adminLeagues above), there's no cross-league "all teams" admin view.
	adminTeams: t.field({
		type: AdminTeamConnectionRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			leagueId: t.arg.id({ required: true }),
			first: t.arg.int({ required: false }),
			after: t.arg.string({ required: false }),
			sortBy: t.arg({ type: AdminTeamSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = clampAdminPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sortDir = args.sortDir ?? "asc"
			const column =
				args.sortBy === "abbreviation" ? teams.abbreviation : teams.name

			const rows = await db
				.select()
				.from(teams)
				.where(eq(teams.leagueId, args.leagueId))
				.orderBy(sortColumn(sortDir, column), asc(teams.id))
				.limit(limit + 1)
				.offset(offset)
			return buildAdminConnection(rows, limit, offset)
		},
	}),

	// League-scoped via an inner join to teams, same reasoning as adminTeams -
	// a free-agent player (currentTeamId null) belongs to no league, so
	// naturally never appears in any league's player list.
	adminPlayers: t.field({
		type: AdminPlayerConnectionRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			leagueId: t.arg.id({ required: true }),
			first: t.arg.int({ required: false }),
			after: t.arg.string({ required: false }),
			sortBy: t.arg({ type: AdminPlayerSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = clampAdminPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sortDir = args.sortDir ?? "asc"
			const column =
				args.sortBy === "position" ? players.position : players.name

			const rows = await db
				.select({ ...getColumns(players) })
				.from(players)
				.innerJoin(teams, eq(teams.id, players.currentTeamId))
				.where(eq(teams.leagueId, args.leagueId))
				.orderBy(sortColumn(sortDir, column), asc(players.id))
				.limit(limit + 1)
				.offset(offset)
			return buildAdminConnection(rows, limit, offset)
		},
	}),

	// League-scoped - no other games list query exists (games are normally
	// only reached via Question.game).
	adminGames: t.field({
		type: AdminGameConnectionRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			leagueId: t.arg.id({ required: true }),
			first: t.arg.int({ required: false }),
			after: t.arg.string({ required: false }),
			sortBy: t.arg({ type: AdminGameSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = clampAdminPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sortDir = args.sortDir ?? "desc"
			const column = args.sortBy === "status" ? games.status : games.startsAt

			const rows = await db
				.select()
				.from(games)
				.where(eq(games.leagueId, args.leagueId))
				.orderBy(sortColumn(sortDir, column), asc(games.id))
				.limit(limit + 1)
				.offset(offset)
			return buildAdminConnection(rows, limit, offset)
		},
	}),
}))

const CreateLeagueInput = builder.inputType("CreateLeagueInput", {
	fields: (t) => ({
		sportId: t.id({ required: true }),
		name: t.string({ required: true }),
		abbreviation: t.string({ required: true }),
		slug: t.string({ required: true }),
		status: t.field({ type: LeagueStatus, required: false }),
	}),
})
const UpdateLeagueInput = builder.inputType("UpdateLeagueInput", {
	fields: (t) => ({
		id: t.id({ required: true }),
		sportId: t.id({ required: true }),
		name: t.string({ required: true }),
		abbreviation: t.string({ required: true }),
		slug: t.string({ required: true }),
		status: t.field({ type: LeagueStatus, required: false }),
	}),
})

const CreateTeamInput = builder.inputType("CreateTeamInput", {
	fields: (t) => ({
		leagueId: t.id({ required: true }),
		name: t.string({ required: true }),
		abbreviation: t.string({ required: true }),
		color: t.string({ required: true }),
	}),
})
const UpdateTeamInput = builder.inputType("UpdateTeamInput", {
	fields: (t) => ({
		id: t.id({ required: true }),
		leagueId: t.id({ required: true }),
		name: t.string({ required: true }),
		abbreviation: t.string({ required: true }),
		color: t.string({ required: true }),
	}),
})

const CreatePlayerInput = builder.inputType("CreatePlayerInput", {
	fields: (t) => ({
		currentTeamId: t.id({ required: false }),
		name: t.string({ required: true }),
		position: t.string({ required: false }),
	}),
})
const UpdatePlayerInput = builder.inputType("UpdatePlayerInput", {
	fields: (t) => ({
		id: t.id({ required: true }),
		currentTeamId: t.id({ required: false }),
		name: t.string({ required: true }),
		position: t.string({ required: false }),
	}),
})

const CreateGameInput = builder.inputType("CreateGameInput", {
	fields: (t) => ({
		leagueId: t.id({ required: true }),
		homeTeamId: t.id({ required: true }),
		awayTeamId: t.id({ required: true }),
		startsAt: t.string({ required: true }),
		status: t.field({ type: GameStatus, required: false }),
		homeScore: t.int({ required: false }),
		awayScore: t.int({ required: false }),
	}),
})
const UpdateGameInput = builder.inputType("UpdateGameInput", {
	fields: (t) => ({
		id: t.id({ required: true }),
		leagueId: t.id({ required: true }),
		homeTeamId: t.id({ required: true }),
		awayTeamId: t.id({ required: true }),
		startsAt: t.string({ required: true }),
		status: t.field({ type: GameStatus, required: false }),
		homeScore: t.int({ required: false }),
		awayScore: t.int({ required: false }),
	}),
})

builder.mutationFields((t) => ({
	createLeague: t.field({
		type: LeagueRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
			directResult: true,
			union: { name: "CreateLeagueResult" },
		},
		args: { input: t.arg({ type: CreateLeagueInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = createLeagueSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const data = parsed.data

			const existing = await db.query.leagues.findFirst({
				where: { slug: data.slug },
			})
			if (existing) throw ValidationError.field("slug", "That slug is taken")

			const [created] = await db.insert(leagues).values(data).returning()
			if (!created) throw new Error("createLeague: insert returned nothing")
			return created
		},
	}),

	updateLeague: t.field({
		type: LeagueRef,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "UpdateLeagueResult" },
		},
		args: { input: t.arg({ type: UpdateLeagueInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = updateLeagueSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const { id, ...data } = parsed.data

			const existing = await db.query.leagues.findFirst({
				where: { slug: data.slug, id: { ne: id } },
			})
			if (existing) throw ValidationError.field("slug", "That slug is taken")

			const [updated] = await db
				.update(leagues)
				.set(data)
				.where(eq(leagues.id, id))
				.returning()
			if (!updated) throw new NotFoundError("League not found")
			return updated
		},
	}),

	createTeam: t.field({
		type: TeamRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
			directResult: true,
			union: { name: "CreateTeamResult" },
		},
		args: { input: t.arg({ type: CreateTeamInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = createTeamSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const data = parsed.data

			const existing = await db.query.teams.findFirst({
				where: { leagueId: data.leagueId, abbreviation: data.abbreviation },
			})
			if (existing) {
				throw ValidationError.field(
					"abbreviation",
					"A team with that abbreviation already exists in this league",
				)
			}

			const [created] = await db.insert(teams).values(data).returning()
			if (!created) throw new Error("createTeam: insert returned nothing")
			return created
		},
	}),

	updateTeam: t.field({
		type: TeamRef,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "UpdateTeamResult" },
		},
		args: { input: t.arg({ type: UpdateTeamInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = updateTeamSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const { id, ...data } = parsed.data

			const existing = await db.query.teams.findFirst({
				where: {
					leagueId: data.leagueId,
					abbreviation: data.abbreviation,
					id: { ne: id },
				},
			})
			if (existing) {
				throw ValidationError.field(
					"abbreviation",
					"A team with that abbreviation already exists in this league",
				)
			}

			const [updated] = await db
				.update(teams)
				.set(data)
				.where(eq(teams.id, id))
				.returning()
			if (!updated) throw new NotFoundError("Team not found")
			return updated
		},
	}),

	createPlayer: t.field({
		type: PlayerRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
			directResult: true,
			union: { name: "CreatePlayerResult" },
		},
		args: { input: t.arg({ type: CreatePlayerInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = createPlayerSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const data = parsed.data

			const [created] = await db
				.insert(players)
				.values({ ...data, position: data.position || null })
				.returning()
			if (!created) throw new Error("createPlayer: insert returned nothing")
			return created
		},
	}),

	updatePlayer: t.field({
		type: PlayerRef,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "UpdatePlayerResult" },
		},
		args: { input: t.arg({ type: UpdatePlayerInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = updatePlayerSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const { id, ...data } = parsed.data

			const [updated] = await db
				.update(players)
				.set({ ...data, position: data.position || null })
				.where(eq(players.id, id))
				.returning()
			if (!updated) throw new NotFoundError("Player not found")
			return updated
		},
	}),

	createGame: t.field({
		type: GameRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
			directResult: true,
			union: { name: "CreateGameResult" },
		},
		args: { input: t.arg({ type: CreateGameInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = createGameSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const { startsAt, ...rest } = parsed.data

			const [created] = await db
				.insert(games)
				.values({ ...rest, startsAt: new Date(startsAt) })
				.returning()
			if (!created) throw new Error("createGame: insert returned nothing")
			return created
		},
	}),

	updateGame: t.field({
		type: GameRef,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "UpdateGameResult" },
		},
		args: { input: t.arg({ type: UpdateGameInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = updateGameSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const { id, startsAt, ...rest } = parsed.data

			const [updated] = await db
				.update(games)
				.set({ ...rest, startsAt: new Date(startsAt) })
				.where(eq(games.id, id))
				.returning()
			if (!updated) throw new NotFoundError("Game not found")
			return updated
		},
	}),
}))
