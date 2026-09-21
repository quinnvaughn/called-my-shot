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
import type { z } from "zod"
import { db } from "../../../db"
import { games, leagues, players, teams } from "../../../db/schema"
import { requireAdmin } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { requireCurrentSeason } from "../../../lib/seasons"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { parseInput } from "../../helpers"
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

// Every catalog write below is admin-only and opens the same way.
function adminInput<S extends z.ZodType>(
	ctx: Context,
	schema: S,
	input: unknown,
): z.output<S> {
	requireAdmin(ctx)
	return parseInput(schema, input)
}

// An update's one returned row, or NotFoundError when the id matched nothing.
async function oneOrNotFound<R>(rows: Promise<R[]>, message: string) {
	const [row] = await rows
	if (!row) throw new NotFoundError(message)
	return row
}

const slugTaken = () => ValidationError.field("slug", "That slug is taken")
const abbreviationTaken = () =>
	ValidationError.field(
		"abbreviation",
		"A team with that abbreviation already exists in this league",
	)

builder.mutationFields((t) => ({
	createLeague: t.field({
		type: LeagueRef,
		errors: {
			types: [AuthenticationError, AuthorizationError],
			directResult: true,
			union: { name: "CreateLeagueResult" },
		},
		args: { input: t.arg({ type: CreateLeagueInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const data = adminInput(ctx, createLeagueSchema, args.input)

			if (await db.query.leagues.findFirst({ where: { slug: data.slug } })) {
				throw slugTaken()
			}

			const [created] = await db.insert(leagues).values(data).returning()
			return created
		},
	}),

	updateLeague: t.field({
		type: LeagueRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "UpdateLeagueResult" },
		},
		args: { input: t.arg({ type: UpdateLeagueInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const { id, ...data } = adminInput(ctx, updateLeagueSchema, args.input)

			const existing = await db.query.leagues.findFirst({
				where: { slug: data.slug, id: { ne: id } },
			})
			if (existing) throw slugTaken()

			return oneOrNotFound(
				db.update(leagues).set(data).where(eq(leagues.id, id)).returning(),
				"League not found",
			)
		},
	}),

	createTeam: t.field({
		type: TeamRef,
		errors: {
			types: [AuthenticationError, AuthorizationError],
			directResult: true,
			union: { name: "CreateTeamResult" },
		},
		args: { input: t.arg({ type: CreateTeamInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const data = adminInput(ctx, createTeamSchema, args.input)

			const existing = await db.query.teams.findFirst({
				where: { leagueId: data.leagueId, abbreviation: data.abbreviation },
			})
			if (existing) throw abbreviationTaken()

			const [created] = await db
				.insert(teams)
				.values({
					...data,
					conference: data.conference || null,
					division: data.division || null,
				})
				.returning()
			return created
		},
	}),

	updateTeam: t.field({
		type: TeamRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "UpdateTeamResult" },
		},
		args: { input: t.arg({ type: UpdateTeamInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const { id, ...data } = adminInput(ctx, updateTeamSchema, args.input)

			const existing = await db.query.teams.findFirst({
				where: {
					leagueId: data.leagueId,
					abbreviation: data.abbreviation,
					id: { ne: id },
				},
			})
			if (existing) throw abbreviationTaken()

			return oneOrNotFound(
				db
					.update(teams)
					.set({
						...data,
						conference: data.conference || null,
						division: data.division || null,
					})
					.where(eq(teams.id, id))
					.returning(),
				"Team not found",
			)
		},
	}),

	createPlayer: t.field({
		type: PlayerRef,
		errors: {
			types: [AuthenticationError, AuthorizationError],
			directResult: true,
			union: { name: "CreatePlayerResult" },
		},
		args: { input: t.arg({ type: CreatePlayerInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const data = adminInput(ctx, createPlayerSchema, args.input)

			const [created] = await db
				.insert(players)
				.values({ ...data, position: data.position || null })
				.returning()
			return created
		},
	}),

	updatePlayer: t.field({
		type: PlayerRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "UpdatePlayerResult" },
		},
		args: { input: t.arg({ type: UpdatePlayerInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const { id, ...data } = adminInput(ctx, updatePlayerSchema, args.input)

			return oneOrNotFound(
				db
					.update(players)
					.set({ ...data, position: data.position || null })
					.where(eq(players.id, id))
					.returning(),
				"Player not found",
			)
		},
	}),

	createGame: t.field({
		type: GameRef,
		errors: {
			types: [AuthenticationError, AuthorizationError],
			directResult: true,
			union: { name: "CreateGameResult" },
		},
		args: { input: t.arg({ type: CreateGameInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const { startsAt, ...rest } = adminInput(
				ctx,
				createGameSchema,
				args.input,
			)

			// Manually-entered games (no ESPN event backing them) get the same
			// current-season derivation as everything else - see createQuestion's
			// own seasonId comment in graphql/types/question/mutations/create-question.ts.
			const season = await requireCurrentSeason(rest.leagueId)

			const [created] = await db
				.insert(games)
				.values({ ...rest, seasonId: season.id, startsAt: new Date(startsAt) })
				.returning()
			return created
		},
	}),

	updateGame: t.field({
		type: GameRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "UpdateGameResult" },
		},
		args: { input: t.arg({ type: UpdateGameInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const { id, startsAt, ...rest } = adminInput(
				ctx,
				updateGameSchema,
				args.input,
			)

			return oneOrNotFound(
				db
					.update(games)
					.set({ ...rest, startsAt: new Date(startsAt) })
					.where(eq(games.id, id))
					.returning(),
				"Game not found",
			)
		},
	}),
}))
