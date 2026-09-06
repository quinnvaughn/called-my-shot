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
import { eq } from "drizzle-orm"
import { db } from "../../../db"
import { games, leagues, players, teams } from "../../../db/schema"
import { requireAdmin } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { getCurrentSeason } from "../../../lib/seasons"
import { builder } from "../../builder"
import { PlayerRef } from "./catalog"
import { GameRef } from "./game"
import {
	CreateGameInput,
	CreateLeagueInput,
	CreatePlayerInput,
	CreateTeamInput,
	UpdateGameInput,
	UpdateLeagueInput,
	UpdatePlayerInput,
	UpdateTeamInput,
} from "./inputs"
import { LeagueRef } from "./league"
import { TeamRef } from "./team"

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

			const [created] = await db
				.insert(teams)
				.values({
					...data,
					conference: data.conference || null,
					division: data.division || null,
				})
				.returning()
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
				.set({
					...data,
					conference: data.conference || null,
					division: data.division || null,
				})
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

			// Manually-entered games (no ESPN event backing them) get the same
			// current-season derivation as everything else - see createQuestion's
			// own seasonId comment in graphql/types/question/mutations/create-question.ts.
			const seasonId = (await getCurrentSeason(rest.leagueId))?.id
			if (!seasonId) {
				throw ValidationError.field(
					"leagueId",
					"This league isn't set up yet - no season data has synced for it.",
				)
			}

			const [created] = await db
				.insert(games)
				.values({ ...rest, seasonId, startsAt: new Date(startsAt) })
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
