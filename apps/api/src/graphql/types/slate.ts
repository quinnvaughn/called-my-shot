import {
	attachQuestionToSlateSchema,
	createSlateSchema,
	updateSlateQuestionSchema,
} from "@called-my-shot/schemas"
import { and, count, eq, inArray, sql } from "drizzle-orm"
import { db } from "../../db"
import {
	calls,
	type Slate,
	type SlateQuestion,
	slateQuestions,
	slates,
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

type Connection<T> = {
	items: T[]
	pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

// draft: fully editable, invisible everywhere public. published: shows up on
// every member's detail page and feed card. See slateStatus on the slates
// table (db/schema/slates.ts) for the full reasoning.
export const SlateStatus = builder.enumType("SlateStatus", {
	values: {
		DRAFT: { value: "draft" },
		PUBLISHED: { value: "published" },
	},
})

const AdminSlateSort = builder.enumType("AdminSlateSort", {
	values: {
		NAME: { value: "name" },
		STATUS: { value: "status" },
		CREATED_AT: { value: "createdAt" },
	},
})

// Exposes both directions of the join row (question, for the builder/member
// list; slate, for QuestionRef.slateMembership below) - one type covers both
// call sites rather than two near-identical ones.
export const SlateQuestionRef = builder.drizzleObject("slateQuestions", {
	name: "SlateQuestion",
	fields: (t) => ({
		id: t.exposeID("id"),
		label: t.exposeString("label"),
		slot: t.exposeString("slot", { nullable: true }),
		sortOrder: t.exposeInt("sortOrder"),
		question: t.relation("question"),
		slate: t.relation("slate"),
	}),
})

export const SlateRef = builder.drizzleObject("slates", {
	name: "Slate",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		status: t.field({ type: SlateStatus, resolve: (slate) => slate.status }),
		publishedAt: t.field({
			type: "String",
			nullable: true,
			resolve: (slate) => slate.publishedAt?.toISOString() ?? null,
		}),
		createdAt: t.field({
			type: "String",
			resolve: (slate) => slate.createdAt.toISOString(),
		}),
		sport: t.relation("sport"),
		league: t.relation("league"),
		season: t.relation("season"),
		memberCount: t.relatedCount("members"),
		members: t.relation("members", {
			query: () => ({
				orderBy: { sortOrder: "asc" },
				with: { question: true },
			}),
		}),
		// How many of this slate's questions the viewer has already called -
		// batched by slateId (not questionId) so several feed cards belonging to
		// the same slate on one page collapse into a single query. Null when
		// signed out; the frontend reads null-or-zero as "hasn't started this
		// slate yet" either way.
		viewerCalledCount: t.loadable({
			type: "Int",
			nullable: true,
			load: async (slateIds: string[], ctx) => {
				if (!ctx.user) return slateIds.map(() => null)
				const rows = await db
					.select({
						slateId: slateQuestions.slateId,
						cnt: count(calls.id),
					})
					.from(slateQuestions)
					.innerJoin(
						calls,
						and(
							eq(calls.questionId, slateQuestions.questionId),
							eq(calls.userId, ctx.user.id),
						),
					)
					.where(inArray(slateQuestions.slateId, slateIds))
					.groupBy(slateQuestions.slateId)
				const byId = new Map(rows.map((r) => [r.slateId, Number(r.cnt)]))
				return slateIds.map((id) => byId.get(id) ?? 0)
			},
			resolve: (slate) => slate.id,
		}),
	}),
})

const AdminSlateConnectionRef = builder
	.objectRef<Connection<Slate>>("AdminSlateConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [SlateRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

const SlatePayload = builder
	.objectRef<{ slate: Slate }>("SlatePayload")
	.implement({
		fields: (t) => ({
			slate: t.field({ type: SlateRef, resolve: (payload) => payload.slate }),
		}),
	})

const SlateQuestionPayload = builder
	.objectRef<{ slateQuestion: SlateQuestion }>("SlateQuestionPayload")
	.implement({
		fields: (t) => ({
			slateQuestion: t.field({
				type: SlateQuestionRef,
				resolve: (payload) => payload.slateQuestion,
			}),
		}),
	})

const CreateSlateInput = builder.inputType("CreateSlateInput", {
	fields: (t) => ({
		name: t.string({ required: true }),
		leagueId: t.id({ required: true }),
	}),
})

// Also used as createQuestion's optional `slate` param (see CreateQuestionInput
// in question.ts) - a question being created has no id yet, so this never
// carries a questionId itself.
export const SlateQuestionInput = builder.inputType("SlateQuestionInput", {
	fields: (t) => ({
		slateId: t.id({ required: true }),
		label: t.string({ required: true }),
		slot: t.string({ required: false }),
	}),
})

const AttachQuestionToSlateInput = builder.inputType(
	"AttachQuestionToSlateInput",
	{
		fields: (t) => ({
			slateId: t.id({ required: true }),
			questionId: t.id({ required: true }),
			label: t.string({ required: true }),
			slot: t.string({ required: false }),
		}),
	},
)

const UpdateSlateQuestionInput = builder.inputType("UpdateSlateQuestionInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		label: t.string({ required: true }),
		slot: t.string({ required: false }),
	}),
})

builder.queryFields((t) => ({
	// Public - but only ever resolves for a published slate. A draft slate's
	// existence isn't exposed to non-admins at all, same as its members show
	// no slate UI anywhere until published (see QuestionRef.slateMembership).
	slate: t.field({
		type: SlateRef,
		nullable: true,
		args: { id: t.arg.id({ required: true }) },
		resolve: async (_root, args) => {
			if (!isUuid(args.id)) return null
			const slate = await db.query.slates.findFirst({
				where: { id: args.id },
			})
			if (!slate || slate.status !== "published") return null
			return slate
		},
	}),

	adminSlates: t.field({
		type: AdminSlateConnectionRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			first: t.arg.int(),
			after: t.arg.string(),
			search: t.arg.string(),
			status: t.arg({ type: SlateStatus, required: false }),
			leagueId: t.arg.id({ required: false }),
			sortBy: t.arg({ type: AdminSlateSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = clampAdminPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sortBy = args.sortBy ?? "name"
			const sortDir = args.sortDir ?? "asc"

			const rows = await db.query.slates.findMany({
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

	// Admin builder's own load - includes draft slates and doesn't filter the
	// member list the way the public `slate` query does.
	adminSlate: t.field({
		type: SlateRef,
		nullable: true,
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: { id: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			if (!isUuid(args.id)) return null
			return db.query.slates.findFirst({ where: { id: args.id } })
		},
	}),

	// Backs the create-question form's "add to slate" autocomplete - a
	// bounded typeahead result set scoped to the question's own league, not
	// something a caller pages through. Same shape as the `games` query this
	// mirrors (sports.ts).
	adminSlateSearch: t.field({
		type: [SlateRef],
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			leagueId: t.arg.id({ required: true }),
			query: t.arg.string({ required: false }),
			first: t.arg.int({ required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = Math.min(Math.max(args.first ?? 8, 1), 20)
			return db.query.slates.findMany({
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
	createSlate: t.field({
		type: SlatePayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
			directResult: true,
			union: { name: "CreateSlateResult" },
		},
		args: { input: t.arg({ type: CreateSlateInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireAdmin(ctx)
			const parsed = createSlateSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)

			const league = await db.query.leagues.findFirst({
				where: { id: parsed.data.leagueId },
			})
			if (!league) throw ValidationError.field("leagueId", "League not found")

			// sportId/seasonId are always derived, never asked of the admin - see
			// slates.sportId/seasonId in db/schema/slates.ts.
			const season = await getCurrentSeason(league.id)
			if (!season) {
				throw ValidationError.field(
					"leagueId",
					"This league isn't set up yet - no season data has synced for it.",
				)
			}

			const [slate] = await db
				.insert(slates)
				.values({
					name: parsed.data.name,
					sportId: league.sportId,
					leagueId: league.id,
					seasonId: season.id,
					createdBy: user.id,
				})
				.returning()

			return { slate }
		},
	}),

	renameSlate: t.field({
		type: SlatePayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "RenameSlateResult" },
		},
		args: {
			id: t.arg.id({ required: true }),
			name: t.arg.string({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const name = args.name.trim()
			if (!name) throw ValidationError.field("name", "Name this slate")

			const [slate] = await db
				.update(slates)
				.set({ name })
				.where(eq(slates.id, args.id))
				.returning()
			if (!slate) throw new NotFoundError("Slate not found")
			return { slate }
		},
	}),

	setSlatePublished: t.field({
		type: SlatePayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "SetSlatePublishedResult" },
		},
		args: {
			id: t.arg.id({ required: true }),
			published: t.arg.boolean({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const [slate] = await db
				.update(slates)
				.set({
					status: args.published ? "published" : "draft",
					publishedAt: args.published ? new Date() : null,
				})
				.where(eq(slates.id, args.id))
				.returning()
			if (!slate) throw new NotFoundError("Slate not found")
			return { slate }
		},
	}),

	// Cascades slateQuestions rows (onDelete: cascade) - the questions
	// themselves are never touched, same as removeQuestionFromSlate below.
	deleteSlate: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError, AuthorizationError],
			union: { name: "DeleteSlateResult" },
		},
		args: { id: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			await db.delete(slates).where(eq(slates.id, args.id))
			return true
		},
	}),

	attachQuestionToSlate: t.field({
		type: SlateQuestionPayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "AttachQuestionToSlateResult" },
		},
		args: {
			input: t.arg({ type: AttachQuestionToSlateInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = attachQuestionToSlateSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const { slateId, questionId, label, slot } = parsed.data

			const [slate, question, existing] = await Promise.all([
				db.query.slates.findFirst({ where: { id: slateId } }),
				db.query.questions.findFirst({ where: { id: questionId } }),
				db.query.slateQuestions.findFirst({ where: { questionId } }),
			])
			if (!slate) throw new NotFoundError("Slate not found")
			if (!question) throw new NotFoundError("Question not found")
			if (existing) {
				throw ValidationError.field(
					"questionId",
					"This question is already in a slate",
				)
			}
			if (question.leagueId !== slate.leagueId) {
				throw ValidationError.field(
					"questionId",
					"Question must be in the same league as the slate",
				)
			}

			const slateQuestion = await db.transaction(async (tx) => {
				const [{ maxSortOrder }] = await tx
					.select({
						maxSortOrder: sql<number>`coalesce(max(${slateQuestions.sortOrder}), -1)`,
					})
					.from(slateQuestions)
					.where(eq(slateQuestions.slateId, slateId))
				const [inserted] = await tx
					.insert(slateQuestions)
					.values({
						slateId,
						questionId,
						label,
						slot: slot ?? null,
						sortOrder: maxSortOrder + 1,
					})
					.returning()
				return inserted
			})

			return { slateQuestion }
		},
	}),

	// Removes the question from the slate only - the question itself is
	// never deleted, same "unlink != delete" precedent as removeGroupMember.
	removeQuestionFromSlate: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError, AuthorizationError],
			union: { name: "RemoveQuestionFromSlateResult" },
		},
		args: { questionId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			await db
				.delete(slateQuestions)
				.where(eq(slateQuestions.questionId, args.questionId))
			return true
		},
	}),

	// Always sends both fields (the builder's row inputs are bound to current
	// state) - a full replace, not a partial patch.
	updateSlateQuestion: t.field({
		type: SlateQuestionPayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "UpdateSlateQuestionResult" },
		},
		args: { input: t.arg({ type: UpdateSlateQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = updateSlateQuestionSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)

			const [slateQuestion] = await db
				.update(slateQuestions)
				.set({ label: parsed.data.label, slot: parsed.data.slot ?? null })
				.where(eq(slateQuestions.questionId, parsed.data.questionId))
				.returning()
			if (!slateQuestion)
				throw new NotFoundError("This question isn't in a slate")
			return { slateQuestion }
		},
	}),

	// New questions always append to the end (see the sortOrder derivation in
	// attachQuestionToSlate/createQuestion) - this is the only way membership
	// order actually changes, driven by the builder's up/down controls.
	reorderSlateQuestions: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
			union: { name: "ReorderSlateQuestionsResult" },
		},
		args: {
			slateId: t.arg.id({ required: true }),
			orderedQuestionIds: t.arg({ type: ["ID"], required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const current = await db.query.slateQuestions.findMany({
				where: { slateId: args.slateId },
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
					"That doesn't match this slate's current members",
				)
			}

			await db.transaction(async (tx) => {
				await Promise.all(
					incoming.map((questionId, index) =>
						tx
							.update(slateQuestions)
							.set({ sortOrder: index })
							.where(
								and(
									eq(slateQuestions.slateId, args.slateId),
									eq(slateQuestions.questionId, questionId),
								),
							),
					),
				)
			})
			return true
		},
	}),
}))
