import { PRESSER_REPORT_REASONS } from "@called-my-shot/schemas"
import { and, count, eq, isNotNull, type SQL } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../../../db"
import {
	type Presser,
	type PresserQuestion,
	type PresserReport,
	presserQuestions,
} from "../../../db/schema"
import {
	ensureAppQuestions,
	isPresserOpen,
} from "../../../lib/pressers/app-questions"
import { askEligibility } from "../../../lib/pressers/ask"
import {
	canSeeQuestion,
	visibleStatement,
} from "../../../lib/pressers/visibility"
import { builder } from "../../builder"
import { CallRef } from "../question/call"
import { GameRef } from "../sports"
import { UserRef } from "../user"

export const PresserQuestionSourceEnum = builder.enumType(
	"PresserQuestionSource",
	{
		values: {
			APP: { value: "app" },
			GROUP: { value: "group" },
			GAME_CALLER: { value: "game_caller" },
		},
	},
)

// Why the viewer can or can't ask a question at a presser - see
// askEligibility in lib/pressers/ask.ts.
export const PresserAskStatusEnum = builder.enumType("PresserAskStatus", {
	values: {
		CAN_ASK: { value: "can_ask" },
		SIGNED_OUT: { value: "signed_out" },
		OWN_PRESSER: { value: "own_presser" },
		CLOSED: { value: "closed" },
		ALREADY_ASKED: { value: "already_asked" },
		BLOCKED: { value: "blocked" },
		NOT_ELIGIBLE: { value: "not_eligible" },
		NEW_ACCOUNT: { value: "new_account" },
		STRANGER_CAP_REACHED: { value: "stranger_cap_reached" },
	},
})

export const PresserReportTargetEnum = builder.enumType("PresserReportTarget", {
	values: {
		QUESTION: { value: "question" },
		ANSWER: { value: "answer" },
		STATEMENT: { value: "statement" },
	},
})

export const PresserReportReasonEnum = builder.enumType("PresserReportReason", {
	values: Object.fromEntries(
		PRESSER_REPORT_REASONS.map((reason) => [
			reason.toUpperCase(),
			{ value: reason },
		]),
	) as Record<
		Uppercase<(typeof PRESSER_REPORT_REASONS)[number]>,
		{ value: (typeof PRESSER_REPORT_REASONS)[number] }
	>,
})

export const PresserQuestionRef = builder
	.objectRef<PresserQuestion>("PresserQuestion")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			source: t.field({
				type: PresserQuestionSourceEnum,
				resolve: (q) => q.source,
			}),
			// Null on an app question, and once the asker's account is gone.
			asker: t.field({
				type: UserRef,
				nullable: true,
				resolve: (q) =>
					q.askerId
						? db.query.users
								.findFirst({ where: { id: q.askerId } })
								.then((user) => user ?? null)
						: null,
			}),
			body: t.exposeString("body"),
			// Null until answered, and on a "No comment".
			answer: t.exposeString("answerText", { nullable: true }),
			noComment: t.exposeBoolean("noComment"),
			isAnswered: t.boolean({ resolve: (q) => q.status === "answered" }),
			answeredAt: t.field({
				type: "DateTime",
				nullable: true,
				resolve: (q) => q.answeredAt,
			}),
			createdAt: t.field({ type: "DateTime", resolve: (q) => q.createdAt }),
			// The call an app question is about. Null on a question about the
			// whole game, and on every question a person asked.
			call: t.field({
				type: CallRef,
				nullable: true,
				resolve: (q) =>
					q.callId
						? db.query.calls
								.findFirst({ where: { id: q.callId } })
								.then((call) => call ?? null)
						: null,
			}),
		}),
	})

async function countQuestions(
	presserId: string,
	where: SQL | undefined,
): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(presserQuestions)
		.where(and(eq(presserQuestions.presserId, presserId), where))
	return row?.n ?? 0
}

export const PresserRef = builder.objectRef<Presser>("Presser").implement({
	fields: (t) => ({
		id: t.exposeID("id"),
		owner: t.field({
			type: UserRef,
			resolve: async (p) => {
				const user = await db.query.users.findFirst({ where: { id: p.userId } })
				if (!user) throw new Error("Presser owner missing")
				return user
			},
		}),
		game: t.field({
			type: GameRef,
			resolve: async (p) => {
				const game = await db.query.games.findFirst({ where: { id: p.gameId } })
				if (!game) throw new Error("Presser game missing")
				return game
			},
		}),
		openedAt: t.field({ type: "DateTime", resolve: (p) => p.openedAt }),
		closesAt: t.field({ type: "DateTime", resolve: (p) => p.closesAt }),
		isOpen: t.boolean({ resolve: (p) => isPresserOpen(p) }),
		viewerIsOwner: t.boolean({
			resolve: (p, _args, ctx) => ctx.user?.id === p.userId,
		}),
		// Null when none was posted, or an admin took it down.
		statement: t.string({
			nullable: true,
			resolve: (p) => visibleStatement(p),
		}),
		statementPostedAt: t.field({
			type: "DateTime",
			nullable: true,
			resolve: (p) => (visibleStatement(p) ? p.statementPostedAt : null),
		}),
		// What the viewer may see, app questions first, then groupmates, then
		// people who faded the owner, then everyone else, each oldest first.
		// The owner's first look writes the app's questions.
		questions: t.field({
			type: [PresserQuestionRef],
			resolve: async (p, _args, ctx) => {
				const viewerId = ctx.user?.id ?? null
				if (viewerId === p.userId) await ensureAppQuestions(p)
				const rows = await db.query.presserQuestions.findMany({
					where: { presserId: p.id, status: { in: ["pending", "answered"] } },
					orderBy: { sortRank: "asc", createdAt: "asc" },
				})
				return rows.filter((q) => canSeeQuestion(q, p, viewerId))
			},
		}),
		// The most recent answer, for a one-line preview wherever the presser
		// is listed. Public by definition, and reading it writes nothing.
		latestAnswer: t.field({
			type: PresserQuestionRef,
			nullable: true,
			resolve: async (p) => {
				const row = await db.query.presserQuestions.findFirst({
					where: { presserId: p.id, status: "answered" },
					orderBy: { answeredAt: "desc" },
				})
				return row ?? null
			},
		}),
		answeredCount: t.int({
			resolve: (p) =>
				countQuestions(p.id, eq(presserQuestions.status, "answered")),
		}),
		// Questions from people still waiting on the owner. Owner only; null
		// for everyone else.
		pendingCount: t.int({
			nullable: true,
			resolve: (p, _args, ctx) => {
				if (ctx.user?.id !== p.userId) return null
				if (!isPresserOpen(p)) return 0
				return countQuestions(
					p.id,
					and(
						eq(presserQuestions.status, "pending"),
						isNotNull(presserQuestions.askerId),
					),
				)
			},
		}),
		// The viewer's own question here, while they can still see it.
		viewerQuestion: t.field({
			type: PresserQuestionRef,
			nullable: true,
			resolve: async (p, _args, ctx) => {
				if (!ctx.user) return null
				const row = await db.query.presserQuestions.findFirst({
					where: { presserId: p.id, askerId: ctx.user.id },
				})
				return row && canSeeQuestion(row, p, ctx.user.id) ? row : null
			},
		}),
		viewerAskStatus: t.field({
			type: PresserAskStatusEnum,
			resolve: async (p, _args, ctx) =>
				(await askEligibility(db, ctx.user, p)).status,
		}),
	}),
})

// An open report, for the admin page. The reported text is read straight off
// the row, whatever its status, so an admin sees a pending question the
// owner reported.
export const PresserReportRef = builder
	.objectRef<PresserReport>("PresserReport")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			target: t.field({
				type: PresserReportTargetEnum,
				resolve: (r) => r.target,
			}),
			reason: t.field({
				type: PresserReportReasonEnum,
				resolve: (r) => r.reason,
			}),
			details: t.exposeString("details", { nullable: true }),
			createdAt: t.field({ type: "DateTime", resolve: (r) => r.createdAt }),
			reporter: t.field({
				type: UserRef,
				nullable: true,
				resolve: (r) =>
					db.query.users
						.findFirst({ where: { id: r.reporterId } })
						.then((user) => user ?? null),
			}),
			// Who wrote what was reported: the asker of a question, the owner
			// of an answer or a statement. Null for an app question.
			author: t.field({
				type: UserRef,
				nullable: true,
				resolve: async (r) => {
					const authorId = await match(r.target)
						.with("question", async () => {
							const q = await db.query.presserQuestions.findFirst({
								where: { id: r.presserQuestionId ?? "" },
							})
							return q?.askerId ?? null
						})
						.with("answer", "statement", async () => {
							const p = await db.query.pressers.findFirst({
								where: { id: r.presserId },
							})
							return p?.userId ?? null
						})
						.exhaustive()
					if (!authorId) return null
					const user = await db.query.users.findFirst({
						where: { id: authorId },
					})
					return user ?? null
				},
			}),
			presser: t.field({
				type: PresserRef,
				nullable: true,
				resolve: (r) =>
					db.query.pressers
						.findFirst({ where: { id: r.presserId } })
						.then((p) => p ?? null),
			}),
			// The words that were reported, as written.
			reportedText: t.string({
				resolve: async (r) => {
					if (r.target === "statement") {
						const p = await db.query.pressers.findFirst({
							where: { id: r.presserId },
						})
						return p?.statementText ?? ""
					}
					const q = await db.query.presserQuestions.findFirst({
						where: { id: r.presserQuestionId ?? "" },
					})
					if (!q) return ""
					return r.target === "answer" ? (q.answerText ?? "") : q.body
				},
			}),
			// The question an answer was given to, for context.
			questionBody: t.string({
				nullable: true,
				resolve: async (r) => {
					if (r.target !== "answer") return null
					const q = await db.query.presserQuestions.findFirst({
						where: { id: r.presserQuestionId ?? "" },
					})
					return q?.body ?? null
				},
			}),
		}),
	})
