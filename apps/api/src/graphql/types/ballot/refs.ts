import { and, count, eq, gt, inArray, sql } from "drizzle-orm"
import { db } from "../../../db"
import {
	type Ballot,
	ballotQuestions,
	calls,
	questions,
	type User,
} from "../../../db/schema"
import { type BallotEntry, loadBallotEntry } from "../../../lib/ballot-entry"
import { parsePgTimestamp } from "../../../lib/pg-timestamp"
import { builder } from "../../builder"
import { type Connection, PageInfoRef } from "../pagination"
import { CallRef } from "../question/call"
import { UserRef } from "../user"
import { BallotStatus } from "./enums"

// Exposes both directions of the join row (question, for the builder/member
// list; ballot, for QuestionRef.ballotMembership below) - one type covers
// both call sites rather than two near-identical ones.
export const BallotQuestionRef = builder.drizzleObject("ballotQuestions", {
	name: "BallotQuestion",
	fields: (t) => ({
		id: t.exposeID("id"),
		label: t.exposeString("label"),
		slot: t.exposeString("slot", { nullable: true }),
		section: t.exposeString("section", { nullable: true }),
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
				type: "DateTime",
				resolve: (c) => c.completedAt,
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
			recent: t.field({
				type: [BallotCompletionRef],
				resolve: (s) => s.recent,
			}),
		}),
	})

// One member of someone's filled-out ballot.
const BallotEntryMemberRef = builder
	.objectRef<BallotEntry["members"][number]>("BallotEntryMember")
	.implement({
		fields: (t) => ({
			member: t.field({ type: BallotQuestionRef, resolve: (m) => m.member }),
			call: t.field({ type: CallRef, nullable: true, resolve: (m) => m.call }),
		}),
	})

const BallotEntryRef = builder
	.objectRef<BallotEntry & { user: User }>("BallotEntry")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (e) => e.user }),
			calledCount: t.exposeInt("calledCount"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			points: t.exposeInt("points"),
			members: t.field({
				type: [BallotEntryMemberRef],
				resolve: (e) => e.members,
			}),
		}),
	})

export const BallotRef = builder.drizzleObject("ballots", {
	name: "Ballot",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		// What /ballots/<slug> is addressed by - see ballots.slug.
		slug: t.exposeString("slug"),
		status: t.field({
			type: BallotStatus,
			resolve: (ballot) => ballot.status,
		}),
		publishedAt: t.field({
			type: "DateTime",
			nullable: true,
			resolve: (ballot) => ballot.publishedAt,
		}),
		createdAt: t.field({
			type: "DateTime",
			resolve: (ballot) => ballot.createdAt,
		}),
		sortOrder: t.exposeInt("sortOrder"),
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
		// Soonest still-upcoming lock among this ballot's member questions -
		// null once every member has already locked. The ballot itself has no
		// locksAt of its own (it's an editorial container, not a scoring unit -
		// see BallotQuestionRef above), so this is derived live off the member
		// questions, same definition the ballot detail page's own soonest-lock
		// line uses. Powers the ballot card's "Locks in X" line.
		nextLocksAt: t.loadable({
			type: "DateTime",
			nullable: true,
			load: async (ballotIds: string[]) => {
				const rows = await db
					.select({
						ballotId: ballotQuestions.ballotId,
						// The driver hands back a raw timestamp string here, not an
						// actual Date, regardless of this sql<> type annotation - see
						// parsePgTimestamp for why it needs explicit UTC parsing.
						nextLocksAt: sql<string>`min(${questions.locksAt})`,
					})
					.from(ballotQuestions)
					.innerJoin(questions, eq(questions.id, ballotQuestions.questionId))
					.where(
						and(
							inArray(ballotQuestions.ballotId, ballotIds),
							gt(questions.locksAt, new Date()),
						),
					)
					.groupBy(ballotQuestions.ballotId)
				const byId = new Map(rows.map((r) => [r.ballotId, r.nextLocksAt]))
				return ballotIds.map((id) => {
					const value = byId.get(id)
					return value ? parsePgTimestamp(value) : null
				})
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
								? [{ user, completedAt: parsePgTimestamp(r.completed_at) }]
								: []
						}),
					}
				})
			},
			resolve: (ballot) => ballot.id,
		}),
		// One user's picks on this ballot - what /ballots/<slug>/<username>
		// shows. Null for an unknown username or someone with no calls here.
		entry: t.field({
			type: BallotEntryRef,
			nullable: true,
			args: { username: t.arg.string({ required: true }) },
			resolve: async (ballot, args) => {
				const user = await db.query.users.findFirst({
					where: { username: args.username },
				})
				if (!user) return null
				const entry = await loadBallotEntry(ballot.id, user.id)
				return entry ? { ...entry, user } : null
			},
		}),
	}),
})

export const AdminBallotConnectionRef = builder
	.objectRef<Connection<Ballot>>("AdminBallotConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [BallotRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})
