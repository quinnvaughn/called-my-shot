import { createBallotSchema } from "@called-my-shot/schemas"
import { and, eq, sql } from "drizzle-orm"
import { db } from "../../../../db"
import { ballots } from "../../../../db/schema"
import { requireAdmin } from "../../../../lib/auth"
import { generateUniqueBallotSlug } from "../../../../lib/ballot-slug"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../../lib/errors"
import { getCurrentSeason } from "../../../../lib/seasons"
import { builder } from "../../../builder"
import { BallotPayload, CreateBallotInput } from "../inputs"

builder.mutationFields((t) => ({
	createBallot: t.field({
		type: BallotPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
			directResult: true,
			union: { name: "CreateBallotResult" },
		},
		args: { input: t.arg({ type: CreateBallotInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireAdmin(ctx)
			const parsed = createBallotSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)

			const league = await db.query.leagues.findFirst({
				where: { id: parsed.data.leagueId },
			})
			if (!league) throw ValidationError.field("leagueId", "League not found")

			// sportId/seasonId are always derived, never asked of the admin - see
			// ballots.sportId/seasonId in db/schema/ballots.ts.
			const season = await getCurrentSeason(league.id)
			if (!season) {
				throw ValidationError.field(
					"leagueId",
					"This league isn't set up yet - no season data has synced for it.",
				)
			}

			// Appends to the end of its (league, season) rather than taking the
			// column default, same derivation attachQuestionToBallot uses for a
			// new member - a ballot made by hand mid-season shouldn't jump ahead
			// of the ones already sitting there.
			const [{ maxSortOrder }] = await db
				.select({
					maxSortOrder: sql<number>`coalesce(max(${ballots.sortOrder}), 0)`,
				})
				.from(ballots)
				.where(
					and(eq(ballots.leagueId, league.id), eq(ballots.seasonId, season.id)),
				)

			const [ballot] = await db
				.insert(ballots)
				.values({
					name: parsed.data.name,
					slug: await generateUniqueBallotSlug({
						leagueSlug: league.slug,
						seasonDisplayName: season.displayName,
						name: parsed.data.name,
					}),
					sportId: league.sportId,
					leagueId: league.id,
					seasonId: season.id,
					createdBy: user.id,
					sortOrder: maxSortOrder + 1,
				})
				.returning()

			return { ballot }
		},
	}),

	renameBallot: t.field({
		type: BallotPayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "RenameBallotResult" },
		},
		args: {
			id: t.arg.id({ required: true }),
			name: t.arg.string({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const name = args.name.trim()
			if (!name) throw ValidationError.field("name", "Name this ballot")

			// Name only - the slug stays whatever it was set to at creation, so
			// a link already shared keeps resolving (see ballots.slug).
			const [ballot] = await db
				.update(ballots)
				.set({ name })
				.where(eq(ballots.id, args.id))
				.returning()
			if (!ballot) throw new NotFoundError("Ballot not found")
			return { ballot }
		},
	}),

	setBallotPublished: t.field({
		type: BallotPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "SetBallotPublishedResult" },
		},
		args: {
			id: t.arg.id({ required: true }),
			published: t.arg.boolean({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const [ballot] = await db
				.update(ballots)
				.set({
					status: args.published ? "published" : "draft",
					publishedAt: args.published ? new Date() : null,
				})
				.where(eq(ballots.id, args.id))
				.returning()
			if (!ballot) throw new NotFoundError("Ballot not found")
			return { ballot }
		},
	}),

	// Cascades ballotQuestions rows (onDelete: cascade) - the questions
	// themselves are never touched, same as removeQuestionFromBallot below.
	deleteBallot: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError, AuthorizationError],
			union: { name: "DeleteBallotResult" },
		},
		args: { id: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			await db.delete(ballots).where(eq(ballots.id, args.id))
			return true
		},
	}),

	// The ballot-level twin of reorderBallotQuestions above, scoped to one
	// (league, season) because that's the only scope ballots.sortOrder is
	// positional within. Takes the full ordered set rather than a single
	// moved id for the same reason that one does: a whole-set write is
	// unambiguous about the result and can't leave gaps or duplicate
	// positions behind. 1-based to match the column default.
	reorderBallots: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
			union: { name: "ReorderBallotsResult" },
		},
		args: {
			leagueId: t.arg.id({ required: true }),
			seasonId: t.arg.id({ required: true }),
			orderedBallotIds: t.arg({ type: ["ID"], required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const current = await db.query.ballots.findMany({
				where: { leagueId: args.leagueId, seasonId: args.seasonId },
				columns: { id: true },
			})
			const currentIds = new Set(current.map((r) => r.id))
			const incoming = args.orderedBallotIds as string[]
			const sameSet =
				incoming.length === currentIds.size &&
				incoming.every((id) => currentIds.has(id))
			if (!sameSet) {
				throw ValidationError.field(
					"orderedBallotIds",
					"That doesn't match this league and season's current ballots",
				)
			}

			await db.transaction(async (tx) => {
				await Promise.all(
					incoming.map((ballotId, index) =>
						tx
							.update(ballots)
							.set({ sortOrder: index + 1 })
							.where(eq(ballots.id, ballotId)),
					),
				)
			})
			return true
		},
	}),
}))
