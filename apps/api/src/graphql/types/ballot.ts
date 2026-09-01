import {
	attachQuestionToBallotSchema,
	createBallotSchema,
	updateBallotQuestionSchema,
} from "@called-my-shot/schemas"
import { and, count, eq, inArray, sql } from "drizzle-orm"
import { db } from "../../db"
import {
	type Ballot,
	type BallotQuestion,
	ballotQuestions,
	ballots,
	calls,
	type User,
} from "../../db/schema"
import {
	buildAdminConnection,
	clampAdminPageSize,
	SortDirection,
} from "../../lib/admin-pagination"
import { requireAdmin } from "../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../lib/errors"
import { decodeOffsetCursor } from "../../lib/pagination"
import { getCurrentSeason } from "../../lib/seasons"
import { isUuid } from "../../lib/uuid"
import { builder } from "../builder"
import { PageInfoRef } from "./pagination"
import { UserRef } from "./user"

type Connection<T> = {
	items: T[]
	pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

// draft: fully editable, invisible everywhere public. published: shows up on
// every member's detail page and feed card. See ballotStatus on the ballots
// table (db/schema/ballots.ts) for the full reasoning.
export const BallotStatus = builder.enumType("BallotStatus", {
	values: {
		DRAFT: { value: "draft" },
		PUBLISHED: { value: "published" },
	},
})

const AdminBallotSort = builder.enumType("AdminBallotSort", {
	values: {
		NAME: { value: "name" },
		STATUS: { value: "status" },
		CREATED_AT: { value: "createdAt" },
	},
})

// Exposes both directions of the join row (question, for the builder/member
// list; ballot, for QuestionRef.ballotMembership below) - one type covers
// both call sites rather than two near-identical ones.
export const BallotQuestionRef = builder.drizzleObject("ballotQuestions", {
	name: "BallotQuestion",
	fields: (t) => ({
		id: t.exposeID("id"),
		label: t.exposeString("label"),
		slot: t.exposeString("slot", { nullable: true }),
		sortOrder: t.exposeInt("sortOrder"),
		question: t.relation("question"),
		ballot: t.relation("ballot"),
	}),
})

// One user who has called every member question of a ballot.
const BallotCompletionRef = builder
	.objectRef<{ user: User; completedAt: Date }>("BallotCompletion")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (c) => c.user }),
			completedAt: t.field({
				type: "String",
				resolve: (c) => c.completedAt.toISOString(),
			}),
		}),
	})

// count excludes the viewer (see BallotRef.completions below); recent is the
// most-recently-finished handful of those, newest first.
const BallotCompletionSummaryRef = builder
	.objectRef<{ count: number; recent: { user: User; completedAt: Date }[] }>(
		"BallotCompletionSummary",
	)
	.implement({
		fields: (t) => ({
			count: t.field({ type: "Int", resolve: (s) => s.count }),
			recent: t.field({ type: [BallotCompletionRef], resolve: (s) => s.recent }),
		}),
	})

export const BallotRef = builder.drizzleObject("ballots", {
	name: "Ballot",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		status: t.field({
			type: BallotStatus,
			resolve: (ballot) => ballot.status,
		}),
		publishedAt: t.field({
			type: "String",
			nullable: true,
			resolve: (ballot) => ballot.publishedAt?.toISOString() ?? null,
		}),
		createdAt: t.field({
			type: "String",
			resolve: (ballot) => ballot.createdAt.toISOString(),
		}),
		sport: t.relation("sport"),
		league: t.relation("league"),
		season: t.relation("season"),
		memberCount: t.relatedCount("members"),
		// No manual `with: { question: true }` here - pothos-drizzle derives the
		// nested `with`/`extras` tree itself from whatever's actually selected
		// under `question` (see BallotQuestionRef.question below). A literal
		// `with` on this query would shallow-clobber that auto-computed one
		// (t.relation spreads the auto hints, then this object, over them) and
		// silently drop things like Question.callCount's count subquery -
		// exactly the "cannot return null for non-nullable field
		// Question.callCount" bug this used to cause once a nested relatedCount
		// was ever requested through this path.
		members: t.relation("members", {
			query: () => ({
				orderBy: { sortOrder: "asc" },
			}),
		}),
		// How many of this ballot's questions the viewer has already called -
		// batched by ballotId (not questionId) so several feed cards belonging to
		// the same ballot on one page collapse into a single query. Null when
		// signed out; the frontend reads null-or-zero as "hasn't started this
		// ballot yet" either way.
		viewerCalledCount: t.loadable({
			type: "Int",
			nullable: true,
			load: async (ballotIds: string[], ctx) => {
				if (!ctx.user) return ballotIds.map(() => null)
				const rows = await db
					.select({
						ballotId: ballotQuestions.ballotId,
						cnt: count(calls.id),
					})
					.from(ballotQuestions)
					.innerJoin(
						calls,
						and(
							eq(calls.questionId, ballotQuestions.questionId),
							eq(calls.userId, ctx.user.id),
						),
					)
					.where(inArray(ballotQuestions.ballotId, ballotIds))
					.groupBy(ballotQuestions.ballotId)
				const byId = new Map(rows.map((r) => [r.ballotId, Number(r.cnt)]))
				return ballotIds.map((id) => byId.get(id) ?? 0)
			},
			resolve: (ballot) => ballot.id,
		}),
		// Who has called EVERY member question of this ballot, and when they
		// finished - powers the public "FULL BALLOTS" stat + completions list.
		// Excludes the viewer (this is "who else finished", not "did I finish" -
		// that's viewerCalledCount above). No DB table tracks this - computed as
		// a straight aggregate, same "raw SQL where the relational builder can't
		// express it cleanly" call as aggregatePointsByUser
		// (lib/points-aggregate.ts).
		completions: t.loadable({
			type: BallotCompletionSummaryRef,
			load: async (ballotIds: readonly string[], ctx) => {
				const ids = [...ballotIds]
				const rows = await db.execute<{
					ballot_id: string
					user_id: string
					completed_at: string
				}>(sql`
					with member_counts as (
						select ballot_id, count(*)::int as total_members
						from ballot_questions
						where ballot_id in ${ids}
						group by ballot_id
					),
					completions as (
						select bq.ballot_id, c.user_id,
							max(c.created_at) as completed_at,
							count(distinct c.question_id) as answered
						from calls c
						join ballot_questions bq on bq.question_id = c.question_id
						where bq.ballot_id in ${ids}
						group by bq.ballot_id, c.user_id
					)
					select completions.ballot_id, completions.user_id, completions.completed_at
					from completions
					join member_counts on member_counts.ballot_id = completions.ballot_id
					where completions.answered = member_counts.total_members
					order by completions.completed_at desc
				`)

				const viewerId = ctx.user?.id ?? null
				const byBallot = new Map<
					string,
					{ user_id: string; completed_at: string }[]
				>()
				for (const row of rows.rows) {
					if (viewerId && row.user_id === viewerId) continue
					const list = byBallot.get(row.ballot_id) ?? []
					list.push(row)
					byBallot.set(row.ballot_id, list)
				}

				// Full user rows only fetched for whoever actually makes a
				// "recent" slice (top 6/ballot), not every completer - the count
				// itself never needs a user row.
				const recentUserIds = [...byBallot.values()]
					.flatMap((list) => list.slice(0, 6))
					.map((r) => r.user_id)
				const userRows =
					recentUserIds.length === 0
						? []
						: await db.query.users.findMany({
								where: { id: { in: recentUserIds } },
							})
				const userById = new Map(userRows.map((u) => [u.id, u]))

				return ids.map((id) => {
					const list = byBallot.get(id) ?? []
					return {
						count: list.length,
						recent: list.slice(0, 6).flatMap((r) => {
							const user = userById.get(r.user_id)
							return user
								? [{ user, completedAt: new Date(r.completed_at) }]
								: []
						}),
					}
				})
			},
			resolve: (ballot) => ballot.id,
		}),
	}),
})

const AdminBallotConnectionRef = builder
	.objectRef<Connection<Ballot>>("AdminBallotConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [BallotRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

const BallotPayload = builder
	.objectRef<{ ballot: Ballot }>("BallotPayload")
	.implement({
		fields: (t) => ({
			ballot: t.field({
				type: BallotRef,
				resolve: (payload) => payload.ballot,
			}),
		}),
	})

const BallotQuestionPayload = builder
	.objectRef<{ ballotQuestion: BallotQuestion }>("BallotQuestionPayload")
	.implement({
		fields: (t) => ({
			ballotQuestion: t.field({
				type: BallotQuestionRef,
				resolve: (payload) => payload.ballotQuestion,
			}),
		}),
	})

const CreateBallotInput = builder.inputType("CreateBallotInput", {
	fields: (t) => ({
		name: t.string({ required: true }),
		leagueId: t.id({ required: true }),
	}),
})

// Also used as createQuestion's optional `ballot` param (see
// CreateQuestionInput in question.ts) - a question being created has no id
// yet, so this never carries a questionId itself.
export const BallotQuestionInput = builder.inputType("BallotQuestionInput", {
	fields: (t) => ({
		ballotId: t.id({ required: true }),
		label: t.string({ required: true }),
		slot: t.string({ required: false }),
	}),
})

const AttachQuestionToBallotInput = builder.inputType(
	"AttachQuestionToBallotInput",
	{
		fields: (t) => ({
			ballotId: t.id({ required: true }),
			questionId: t.id({ required: true }),
			label: t.string({ required: true }),
			slot: t.string({ required: false }),
		}),
	},
)

const UpdateBallotQuestionInput = builder.inputType(
	"UpdateBallotQuestionInput",
	{
		fields: (t) => ({
			questionId: t.id({ required: true }),
			label: t.string({ required: true }),
			slot: t.string({ required: false }),
		}),
	},
)

builder.queryFields((t) => ({
	// Public - but only ever resolves for a published ballot. A draft ballot's
	// existence isn't exposed to non-admins at all, same as its members show
	// no ballot UI anywhere until published (see QuestionRef.ballotMembership).
	ballot: t.field({
		type: BallotRef,
		nullable: true,
		args: { id: t.arg.id({ required: true }) },
		resolve: async (_root, args) => {
			if (!isUuid(args.id)) return null
			const ballot = await db.query.ballots.findFirst({
				where: { id: args.id },
			})
			if (!ballot || ballot.status !== "published") return null
			return ballot
		},
	}),

	// The league room's Season tab - published ballots for one league, plain
	// array like `leagues`/`sports` rather than a connection: a season's worth
	// of award ballots for a single league is a handful of rows, not something
	// worth paginating.
	// The league room's Season tab - scoped to the current season (in
	// progress, else soonest upcoming, else most recently completed - see
	// getCurrentSeason) so a prior year's award ballots don't linger
	// alongside this year's once a new season starts.
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
				orderBy: { name: "asc" },
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
			sortBy: t.arg({ type: AdminBallotSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = clampAdminPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sortBy = args.sortBy ?? "name"
			const sortDir = args.sortDir ?? "asc"

			const rows = await db.query.ballots.findMany({
				where: {
					...(args.status ? { status: args.status } : {}),
					...(args.leagueId ? { leagueId: args.leagueId } : {}),
					...(args.search ? { name: { ilike: `%${args.search}%` } } : {}),
				},
				orderBy:
					sortBy === "status"
						? { status: sortDir }
						: sortBy === "createdAt"
							? { createdAt: sortDir }
							: { name: sortDir },
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
			const limit = Math.min(Math.max(args.first ?? 8, 1), 20)
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

			const [ballot] = await db
				.insert(ballots)
				.values({
					name: parsed.data.name,
					sportId: league.sportId,
					leagueId: league.id,
					seasonId: season.id,
					createdBy: user.id,
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

	attachQuestionToBallot: t.field({
		type: BallotQuestionPayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "AttachQuestionToBallotResult" },
		},
		args: {
			input: t.arg({ type: AttachQuestionToBallotInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = attachQuestionToBallotSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const { ballotId, questionId, label, slot } = parsed.data

			const [ballot, question, existing] = await Promise.all([
				db.query.ballots.findFirst({ where: { id: ballotId } }),
				db.query.questions.findFirst({ where: { id: questionId } }),
				db.query.ballotQuestions.findFirst({ where: { questionId } }),
			])
			if (!ballot) throw new NotFoundError("Ballot not found")
			if (!question) throw new NotFoundError("Question not found")
			if (existing) {
				throw ValidationError.field(
					"questionId",
					"This question is already in a ballot",
				)
			}
			if (question.leagueId !== ballot.leagueId) {
				throw ValidationError.field(
					"questionId",
					"Question must be in the same league as the ballot",
				)
			}

			const ballotQuestion = await db.transaction(async (tx) => {
				const [{ maxSortOrder }] = await tx
					.select({
						maxSortOrder: sql<number>`coalesce(max(${ballotQuestions.sortOrder}), -1)`,
					})
					.from(ballotQuestions)
					.where(eq(ballotQuestions.ballotId, ballotId))
				const [inserted] = await tx
					.insert(ballotQuestions)
					.values({
						ballotId,
						questionId,
						label,
						slot: slot ?? null,
						sortOrder: maxSortOrder + 1,
					})
					.returning()
				return inserted
			})

			return { ballotQuestion }
		},
	}),

	// Removes the question from the ballot only - the question itself is
	// never deleted, same "unlink != delete" precedent as removeGroupMember.
	removeQuestionFromBallot: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError, AuthorizationError],
			union: { name: "RemoveQuestionFromBallotResult" },
		},
		args: { questionId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			await db
				.delete(ballotQuestions)
				.where(eq(ballotQuestions.questionId, args.questionId))
			return true
		},
	}),

	// Always sends both fields (the builder's row inputs are bound to current
	// state) - a full replace, not a partial patch.
	updateBallotQuestion: t.field({
		type: BallotQuestionPayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "UpdateBallotQuestionResult" },
		},
		args: {
			input: t.arg({ type: UpdateBallotQuestionInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = updateBallotQuestionSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)

			const [ballotQuestion] = await db
				.update(ballotQuestions)
				.set({ label: parsed.data.label, slot: parsed.data.slot ?? null })
				.where(eq(ballotQuestions.questionId, parsed.data.questionId))
				.returning()
			if (!ballotQuestion)
				throw new NotFoundError("This question isn't in a ballot")
			return { ballotQuestion }
		},
	}),

	// New questions always append to the end (see the sortOrder derivation in
	// attachQuestionToBallot/createQuestion) - this is the only way membership
	// order actually changes, driven by the builder's up/down controls.
	reorderBallotQuestions: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
			union: { name: "ReorderBallotQuestionsResult" },
		},
		args: {
			ballotId: t.arg.id({ required: true }),
			orderedQuestionIds: t.arg({ type: ["ID"], required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const current = await db.query.ballotQuestions.findMany({
				where: { ballotId: args.ballotId },
				columns: { questionId: true },
			})
			const currentIds = new Set(current.map((r) => r.questionId))
			const incoming = args.orderedQuestionIds as string[]
			const sameSet =
				incoming.length === currentIds.size &&
				incoming.every((id) => currentIds.has(id))
			if (!sameSet) {
				throw ValidationError.field(
					"orderedQuestionIds",
					"That doesn't match this ballot's current members",
				)
			}

			await db.transaction(async (tx) => {
				await Promise.all(
					incoming.map((questionId, index) =>
						tx
							.update(ballotQuestions)
							.set({ sortOrder: index })
							.where(
								and(
									eq(ballotQuestions.ballotId, args.ballotId),
									eq(ballotQuestions.questionId, questionId),
								),
							),
					),
				)
			})
			return true
		},
	}),
}))
