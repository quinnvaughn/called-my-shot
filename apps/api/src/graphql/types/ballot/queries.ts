import { match } from "ts-pattern"
import { db } from "../../../db"
import {
	adminListArgs,
	buildAdminConnection,
} from "../../../lib/admin-pagination"
import { requireAdmin } from "../../../lib/auth"
import { AuthenticationError, AuthorizationError } from "../../../lib/errors"
import { getCurrentSeason } from "../../../lib/seasons"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import { clampTypeahead } from "../../helpers"
import { SortDirection } from "../pagination"
import { AdminBallotSort, BallotStatus } from "./enums"
import { AdminBallotConnectionRef, BallotRef } from "./refs"

builder.queryFields((t) => ({
	// Public - but only ever resolves for a published ballot. A draft ballot's
	// existence isn't exposed to non-admins at all, same as its members show
	// no ballot UI anywhere until published (see QuestionRef.ballotMembership).
	ballot: t.field({
		type: BallotRef,
		nullable: true,
		// Takes a slug ("mlb-2026-al-gold-gloves") or, for links shared before
		// ballots had slugs, the uuid the page used to be addressed by - same
		// dual acceptance the league room's share links already have (see
		// routes/share.ts).
		args: { id: t.arg.id({ required: true }) },
		resolve: async (_root, args) => {
			const ballot = await db.query.ballots.findFirst({
				where: isUuid(args.id) ? { id: args.id } : { slug: args.id },
			})
			if (ballot?.status !== "published") return null
			return ballot
		},
	}),

	// The league room's Ballots tab - published ballots for one league, plain
	// array like `leagues`/`sports` rather than a connection: a season's worth
	// of award ballots for a single league is a handful of rows, not something
	// worth paginating.
	// The league room's Ballots tab - scoped to the current season (in
	// progress, else soonest upcoming, else most recently completed - see
	// getCurrentSeason) so a prior year's award ballots don't linger
	// alongside this year's once a new season starts.
	// Editorial order first (ballots.sortOrder, seeded from the recurring
	// catalog and adjustable in admin), name only as the tiebreak - which is
	// what an untouched set of ballots all sitting on the default 1 falls back
	// to, i.e. exactly the alphabetical order this used to have.
	leagueBallots: t.field({
		type: [BallotRef],
		args: { leagueId: t.arg.id({ required: true }) },
		resolve: async (_root, args) => {
			const currentSeason = await getCurrentSeason(args.leagueId)
			return db.query.ballots.findMany({
				where: {
					leagueId: args.leagueId,
					status: "published",
					...(currentSeason ? { seasonId: currentSeason.id } : {}),
				},
				orderBy: { sortOrder: "asc", name: "asc" },
			})
		},
	}),

	adminBallots: t.field({
		type: AdminBallotConnectionRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			first: t.arg.int(),
			after: t.arg.string(),
			search: t.arg.string(),
			status: t.arg({ type: BallotStatus, required: false }),
			leagueId: t.arg.id({ required: false }),
			// Pairs with leagueId to scope the list down to the one (league,
			// season) that sortOrder is positional within - what the admin list's
			// ordering mode selects on.
			seasonId: t.arg.id({ required: false }),
			sortBy: t.arg({ type: AdminBallotSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const { limit, offset, sortDir } = adminListArgs(ctx, args)
			const sortBy = args.sortBy ?? "name"

			const rows = await db.query.ballots.findMany({
				where: {
					...(args.status ? { status: args.status } : {}),
					...(args.leagueId ? { leagueId: args.leagueId } : {}),
					...(args.seasonId ? { seasonId: args.seasonId } : {}),
					...(args.search ? { name: { ilike: `%${args.search}%` } } : {}),
				},
				orderBy: match(sortBy)
					.with("status", () => ({ status: sortDir }))
					.with("createdAt", () => ({ createdAt: sortDir }))
					// Same name tiebreak leagueBallots uses, so a scope nobody has
					// ordered yet still reads alphabetically rather than by insert order.
					.with("sortOrder", () => ({
						sortOrder: sortDir,
						name: "asc" as const,
					}))
					.with("name", () => ({ name: sortDir }))
					.exhaustive(),
				limit: limit + 1,
				offset,
			})
			return buildAdminConnection(rows, limit, offset)
		},
	}),

	// Admin builder's own load - includes draft ballots and doesn't filter the
	// member list the way the public `ballot` query does.
	adminBallot: t.field({
		type: BallotRef,
		nullable: true,
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: { id: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			if (!isUuid(args.id)) return null
			return db.query.ballots.findFirst({ where: { id: args.id } })
		},
	}),

	// Backs the create-question form's "add to ballot" autocomplete - a
	// bounded typeahead result set scoped to the question's own league, not
	// something a caller pages through. Same shape as the `games` query this
	// mirrors (sports.ts).
	adminBallotSearch: t.field({
		type: [BallotRef],
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			leagueId: t.arg.id({ required: true }),
			query: t.arg.string({ required: false }),
			first: t.arg.int({ required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = clampTypeahead(args.first, 8)
			return db.query.ballots.findMany({
				where: {
					leagueId: args.leagueId,
					...(args.query ? { name: { ilike: `%${args.query}%` } } : {}),
				},
				orderBy: { name: "asc" },
				limit,
			})
		},
	}),
}))
