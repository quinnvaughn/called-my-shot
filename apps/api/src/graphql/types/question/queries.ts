import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	getColumns,
	gt,
	ilike,
	inArray,
	isNotNull,
	isNull,
	lte,
	ne,
	notExists,
	notInArray,
	or,
	sql,
} from "drizzle-orm"
import { DateTime } from "luxon"
import { match } from "ts-pattern"
import { db } from "../../../db"
import {
	ballotQuestions,
	callSelections,
	calls,
	leagues,
	players,
	type Question,
	questionOptions,
	questions,
	teams,
	users,
} from "../../../db/schema"
import {
	buildAdminConnection,
	clampAdminPageSize,
	SortDirection,
	sortColumn,
} from "../../../lib/admin-pagination"
import { requireAdmin, requireUser } from "../../../lib/auth"
import { AuthenticationError, AuthorizationError } from "../../../lib/errors"
import { typicalGameLengthHours } from "../../../lib/game-length"
import {
	clampPageSize,
	decodeOffsetCursor,
	encodeOffsetCursor,
} from "../../../lib/pagination"
import { getCurrentSeason } from "../../../lib/seasons"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import { AdminQueueSummaryRef } from "./admin-queue"
import { CallConnectionRef, CallRef } from "./call"
import {
	AdminQuestionSort,
	CallResolutionStatus,
	CallResultFilter,
	CallSortOrder,
	MyQuestionSort,
	QuestionScope,
	QuestionShape,
	QuestionSortOrder,
	QuestionStatus,
} from "./enums"
import {
	MyCallCountsRef,
	QuestionConnectionRef,
	QuestionRef,
} from "./question-object"

// One row per call carrying everything the My Calls sorts and the hit/miss
// filter need out of call_selections. Both coalesces at the use sites below are
// load-bearing rather than defensive: a numeric-guess call stores its points and
// its conviction on the calls row itself and has no selections at all, while
// every other shape stores both per selection (see the calls/callSelections
// tables). pts stays null while any selection is still pending, matching
// Call.totalPoints in ./call.ts exactly - the two must agree or a call would
// filter as a miss while rendering as unresolved.
const callPoints = db.$with("call_points").as(
	db
		.select({
			callId: callSelections.callId,
			pts: sql<number | null>`
				case when bool_or(${callSelections.resultPoints} is null)
					then null
					else sum(${callSelections.resultPoints})
				end
			`.as("pts"),
			// The biggest single stake, not the sum - a multi-pick call splits its
			// conviction across picks, and "how hard did I lean on this" is the
			// largest one, not a total that grows with the number of picks.
			maxConviction: sql<number | null>`max(${callSelections.conviction})`.as(
				"max_conviction",
			),
		})
		.from(callSelections)
		.groupBy(callSelections.callId),
)

// A call's points as the app defines them, in SQL. Mirrors Call.totalPoints.
const callTotalPoints = sql<
	number | null
>`coalesce(${calls.resultPoints}, ${callPoints.pts})`
// Likewise for conviction - see the CTE above.
const callConviction = sql<
	number | null
>`coalesce(${calls.conviction}, ${callPoints.maxConviction})`

// questions.gameId set or null. Shared by both My pages, so it lives here
// rather than being spelled out twice.
function scopeCondition(scope: "game" | "season_long" | null | undefined) {
	return match(scope)
		.with("game", () => isNotNull(questions.gameId))
		.with("season_long", () => isNull(questions.gameId))
		.otherwise(() => undefined)
}

type MyCallFilters = {
	status: "open" | "resolved"
	leagueId?: string | null
	shapes?: readonly string[] | null
	search?: string | null
	scope?: "game" | "season_long" | null
	result?: "hit" | "miss" | "unscored" | null
}

// Shared by myCalls and myCallCounts so the list and the tab badges above it
// can't disagree about what the current filter matches.
function myCallConditions(userId: string, filters: MyCallFilters) {
	return [
		eq(calls.userId, userId),
		filters.status === "resolved"
			? inArray(questions.status, ["resolved", "voided"])
			: notInArray(questions.status, ["resolved", "voided"]),
		filters.leagueId ? eq(questions.leagueId, filters.leagueId) : undefined,
		filters.shapes && filters.shapes.length > 0
			? inArray(
					questions.shape,
					filters.shapes as (typeof questions.shape.enumValues)[number][],
				)
			: undefined,
		scopeCondition(filters.scope),
		filters.search
			? or(
					ilike(questions.title, `%${filters.search}%`),
					ilike(users.name, `%${filters.search}%`),
					ilike(users.username, `%${filters.search}%`),
					ilike(teams.name, `%${filters.search}%`),
					ilike(teams.abbreviation, `%${filters.search}%`),
					ilike(players.name, `%${filters.search}%`),
				)
			: undefined,
		// A miss scores genuinely negative rather than zero (see
		// @called-my-shot/scoring), so hit/miss is a sign test. UNSCORED is a
		// third outcome rather than a shade of miss - a voided question, or a
		// creator who ended up the only caller, leaves a settled call carrying
		// no result at all.
		match(filters.result)
			.with("hit", () => sql`${callTotalPoints} > 0`)
			.with(
				"miss",
				() => sql`${callTotalPoints} <= 0 and ${calls.unscoredReason} is null`,
			)
			.with(
				"unscored",
				() =>
					sql`(${calls.unscoredReason} is not null or ${callTotalPoints} is null)`,
			)
			.otherwise(() => undefined),
	].filter((c) => c !== undefined)
}

// My Calls' ordering keys, without the trailing calls.id tiebreak every sort
// shares (added at the use site). Closing Soon is ordering only, with no window
// filter - unlike Query.questions' same-named sort, which also narrows to the
// next 48 hours. Your call on an already-locked question that hasn't resolved
// yet still belongs on this page; the leading boolean just sorts those behind
// everything still coming up, since they're waiting on resolution, not on you.
function myCallOrderKeys(
	sort: "closing_soon" | "newest" | "points" | "conviction",
) {
	return match(sort)
		.with("closing_soon", () => [
			asc(sql`(${questions.locksAt} <= now())`),
			asc(questions.locksAt),
		])
		.with("newest", () => [desc(calls.createdAt)])
		.with("points", () => [sql`${callTotalPoints} desc nulls last`])
		.with("conviction", () => [sql`${callConviction} desc nulls last`])
		.exhaustive()
}

builder.queryFields((t) => ({
	// The home feed. leagueId/teamId/search/isOfficial narrow the pool, sort
	// picks the ordering - MOST_CALLED (literal call count, the default), NEW
	// (createdAt), or CLOSING_SOON (soonest locksAt among still-open
	// questions). teamId matches either the question's own subjectTeam or any
	// team entered as one of its options (a championship field a team is
	// competing in).
	questions: t.field({
		type: QuestionConnectionRef,
		args: {
			first: t.arg.int(),
			after: t.arg.string(),
			leagueId: t.arg.id(),
			teamId: t.arg.id(),
			// The game detail page's question list - every question tied to one
			// game, hero (team_vs_team) included. Nothing else passes this today.
			gameId: t.arg.id(),
			search: t.arg.string(),
			// Admin Questions tab only - every other caller of this field leaves it
			// unset and gets every status, same as before this arg existed.
			status: t.arg({ type: QuestionStatus, required: false }),
			// Lets the home feed narrow to admin-curated content (synced
			// team_vs_team questions, season awards) or exclude it - a plain
			// boolean check (`args.isOfficial ?`) would treat isOfficial: false
			// the same as "unset" and silently drop the "community only" half of
			// the filter, so this checks for the arg actually being present.
			isOfficial: t.arg.boolean({ required: false }),
			sort: t.arg({ type: QuestionSortOrder, required: false }),
			// The league room's Feed tab only - season award singles and ballot
			// positions get their own Season tab there, so the feed excludes
			// anything already in a ballot to avoid showing it twice. Every other
			// caller (home, groups) leaves this unset and sees everything, same as
			// before this arg existed.
			excludeBallotMembers: t.arg.boolean({ required: false }),
			// The league room's Feed tab only - a locked-but-unresolved question
			// has nothing left to do with it from a browse list (can't call it,
			// no outcome to see yet either), unlike resolved (still has an
			// outcome worth seeing) or disputed. Every other caller leaves this
			// unset and sees every status, same as before this arg existed.
			excludeLocked: t.arg.boolean({ required: false }),
			// The league room's Feed tab only - team_vs_team questions are synced
			// onto every upcoming game of the current season now (see
			// syncGameQuestions), which would otherwise flood this browse list;
			// each one already has its own home as the game detail page's hero
			// card, reached via the Games tab. Every other caller leaves this
			// unset and sees every shape.
			excludeGameWinners: t.arg.boolean({ required: false }),
			// The league room's Feed tab only - standalone season award races
			// (player_season_award/team_season_award/player_award_finalists)
			// already have their own dedicated home on the Season tab, same
			// reasoning as excludeGameWinners above. Every other caller leaves
			// this unset and sees every shape.
			excludeSeasonAwards: t.arg.boolean({ required: false }),
			// The league room's Feed tab's New sort only - a resolved/disputed
			// question has nothing left to act on, which is the whole point of
			// browsing by "New" (contrast excludeLocked above: that arg keeps
			// resolved/disputed around deliberately, since they still have an
			// outcome worth seeing under Most Called/Closing Soon - New is the
			// one sort where "already decided" doesn't belong). Every other
			// caller leaves this unset and sees every status.
			excludeSettled: t.arg.boolean({ required: false }),
			// Narrows to the listed shapes - every caller that leaves this unset
			// gets every shape.
			shapes: t.arg({ type: [QuestionShape], required: false }),
			// The league room's Season tab - only questions with no game behind
			// them (award races, win totals, season stat questions). Every other
			// caller leaves this unset and gets game questions too.
			seasonLong: t.arg.boolean({ required: false }),
			// The league room's Season tab only - scoped to the current season
			// (in progress, else soonest upcoming, else most recently completed -
			// see getCurrentSeason) so a prior year's award questions don't
			// linger alongside this year's. Requires leagueId; every other
			// caller leaves this unset and gets every season.
			currentSeasonOnly: t.arg.boolean({ required: false }),
		},
		resolve: async (_root, args) => {
			const limit = clampPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sort = args.sort ?? "most_called"
			const currentSeason =
				args.currentSeasonOnly && args.leagueId
					? await getCurrentSeason(args.leagueId)
					: null

			const conditions = [
				args.leagueId ? eq(questions.leagueId, args.leagueId) : undefined,
				args.gameId ? eq(questions.gameId, args.gameId) : undefined,
				args.status ? eq(questions.status, args.status) : undefined,
				typeof args.isOfficial === "boolean"
					? eq(questions.isOfficial, args.isOfficial)
					: undefined,
				args.shapes && args.shapes.length > 0
					? inArray(questions.shape, args.shapes)
					: undefined,
				args.seasonLong ? isNull(questions.gameId) : undefined,
				currentSeason ? eq(questions.seasonId, currentSeason.id) : undefined,
				args.excludeBallotMembers
					? notExists(
							db
								.select({ one: sql`1` })
								.from(ballotQuestions)
								.where(eq(ballotQuestions.questionId, questions.id)),
						)
					: undefined,
				args.excludeLocked
					? notInArray(questions.status, ["locked", "voided"])
					: undefined,
				args.excludeGameWinners
					? ne(questions.shape, "team_vs_team")
					: undefined,
				args.excludeSeasonAwards
					? notInArray(questions.shape, [
							"player_season_award",
							"team_season_award",
							"player_award_finalists",
						])
					: undefined,
				args.excludeSettled
					? notInArray(questions.status, ["resolved", "disputed", "voided"])
					: undefined,
				args.teamId
					? or(
							eq(questions.subjectTeamId, args.teamId),
							exists(
								db
									.select({ one: sql`1` })
									.from(questionOptions)
									.where(
										and(
											eq(questionOptions.questionId, questions.id),
											eq(questionOptions.teamId, args.teamId),
										),
									),
							),
						)
					: undefined,
				args.search
					? or(
							ilike(questions.title, `%${args.search}%`),
							ilike(users.name, `%${args.search}%`),
							ilike(users.username, `%${args.search}%`),
							ilike(teams.name, `%${args.search}%`),
							ilike(teams.abbreviation, `%${args.search}%`),
							ilike(players.name, `%${args.search}%`),
						)
					: undefined,
				// Locked/resolved/disputed questions have nothing left to "close" -
				// closing-soon only makes sense among questions still open. status
				// alone isn't enough, though: nothing flips it off "open" the
				// instant locksAt passes (no cron/worker - see the comment on
				// resolveQuestion below), so a game-linked question can sit
				// "open" for days after its game already started. Excluding
				// anything whose locksAt is already in the past keeps those out
				// of "soon". Also bounded to 48 hours out - a week doesn't read
				// as "soon", and without some bound a sparse feed would pad
				// itself out with questions locking days from now just to fill
				// the page.
				sort === "closing_soon"
					? and(
							eq(questions.status, "open"),
							gt(questions.locksAt, new Date()),
							lte(
								questions.locksAt,
								DateTime.now().plus({ hours: 48 }).toJSDate(),
							),
						)
					: undefined,
			].filter((c) => c !== undefined)

			// Live call count per question, joined in rather than computed with
			// t.relatedCount (as QuestionRef.callCount does) so MOST_CALLED can
			// ORDER BY it directly instead of sorting the page in application code.
			const callCounts = db.$with("call_counts").as(
				db
					.select({
						questionId: calls.questionId,
						cnt: count(calls.id).as("cnt"),
					})
					.from(calls)
					.groupBy(calls.questionId),
			)

			let query = db
				.with(callCounts)
				.select(getColumns(questions))
				.from(questions)
				.leftJoin(users, eq(users.id, questions.creatorId))
				.leftJoin(teams, eq(teams.id, questions.subjectTeamId))
				.leftJoin(players, eq(players.id, questions.subjectPlayerId))
				.leftJoin(callCounts, eq(callCounts.questionId, questions.id))
				.$dynamic()

			if (conditions.length > 0) {
				query = query.where(and(...conditions))
			}

			query =
				sort === "new"
					? // Second key is locksAt, not just id - a sync run can insert a
						// whole batch (e.g. every game entering syncGameQuestions'
						// creation window in one run - see apps/api/src/db/sync/
						// sync-game-questions.ts) with createdAt values only
						// microseconds apart, and id (random per row) wouldn't
						// resolve that into anything sensible. locksAt ascending
						// means a same-instant batch still reads soonest-first
						// within itself, same "what's actually coming up" ordering
						// CLOSING_SOON uses on its own.
						query.orderBy(
							desc(questions.createdAt),
							asc(questions.locksAt),
							desc(questions.id),
						)
					: sort === "closing_soon"
						? query.orderBy(asc(questions.locksAt), desc(questions.id))
						: query.orderBy(
								desc(sql`coalesce(${callCounts.cnt}, 0)`),
								desc(questions.id),
							)

			const rows = await query.limit(limit + 1).offset(offset)
			const hasNextPage = rows.length > limit
			const items = rows.slice(0, limit)

			return {
				items,
				pageInfo: {
					hasNextPage,
					endCursor:
						items.length > 0 ? encodeOffsetCursor(offset + items.length) : null,
				},
			}
		},
	}),

	// Every official question in the league's current season, for /sitemap.xml
	// only - unpaginated and filterless for the same reason as sitemapGames
	// (see it), and scoped the same way.
	//
	// Official only, deliberately. Voided questions are hard-deleted (see
	// questionVoids), so nothing here needs to exclude them - but a
	// user-created question that simply hasn't been reported yet is still
	// unreviewed text, and a sitemap entry is this app asking a crawler to
	// index it. The synced team_vs_team questions and season awards are the
	// ones worth finding in search anyway.
	sitemapQuestions: t.field({
		type: [QuestionRef],
		args: { leagueId: t.arg.id({ required: true }) },
		resolve: async (_root, args) => {
			const currentSeason = await getCurrentSeason(args.leagueId)
			if (!currentSeason) return []
			return db.query.questions.findMany({
				where: {
					leagueId: args.leagueId,
					seasonId: currentSeason.id,
					isOfficial: true,
				},
				orderBy: { createdAt: "asc" },
			})
		},
	}),

	// Admin Questions table - every question regardless of status, with real
	// column sort (unlike the public `questions` field above, which only ever
	// ranks by MOST_CALLED/NEW/CLOSING_SOON). Its own call-count CTE rather than
	// reusing the one above - separate queries, no reason to share a `WITH`.
	adminQuestions: t.field({
		type: QuestionConnectionRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			first: t.arg.int(),
			after: t.arg.string(),
			search: t.arg.string(),
			status: t.arg({ type: QuestionStatus, required: false }),
			sortBy: t.arg({ type: AdminQuestionSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
			leagueId: t.arg.id({ required: false }),
			// The Ballots builder's "attach existing" picker - questions that
			// don't already belong to a ballot (a question can only ever be in
			// one, see ballotQuestions.questionId's unique constraint).
			unassignedToBallot: t.arg.boolean({ required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = clampAdminPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sortBy = args.sortBy ?? "title"
			const sortDir = args.sortDir ?? "asc"

			const conditions = [
				args.status ? eq(questions.status, args.status) : undefined,
				args.leagueId ? eq(questions.leagueId, args.leagueId) : undefined,
				args.unassignedToBallot
					? notExists(
							db
								.select()
								.from(ballotQuestions)
								.where(eq(ballotQuestions.questionId, questions.id)),
						)
					: undefined,
				args.search
					? or(
							ilike(questions.title, `%${args.search}%`),
							ilike(users.name, `%${args.search}%`),
							ilike(users.username, `%${args.search}%`),
						)
					: undefined,
			].filter((c) => c !== undefined)

			const callCounts = db.$with("admin_question_call_counts").as(
				db
					.select({
						questionId: calls.questionId,
						cnt: count(calls.id).as("cnt"),
					})
					.from(calls)
					.groupBy(calls.questionId),
			)

			let query = db
				.with(callCounts)
				.select(getColumns(questions))
				.from(questions)
				.leftJoin(users, eq(users.id, questions.creatorId))
				.leftJoin(callCounts, eq(callCounts.questionId, questions.id))
				.$dynamic()

			if (conditions.length > 0) {
				query = query.where(and(...conditions))
			}

			query =
				sortBy === "asker"
					? query.orderBy(
							sortColumn(sortDir, users.username),
							asc(questions.id),
						)
					: sortBy === "callers"
						? query.orderBy(
								sortDir === "asc"
									? asc(sql`coalesce(${callCounts.cnt}, 0)`)
									: desc(sql`coalesce(${callCounts.cnt}, 0)`),
								asc(questions.id),
							)
						: query.orderBy(
								sortColumn(
									sortDir,
									sortBy === "shape"
										? questions.shape
										: sortBy === "status"
											? questions.status
											: questions.title,
								),
								asc(questions.id),
							)

			const rows = await query.limit(limit + 1).offset(offset)
			return buildAdminConnection(rows, limit, offset)
		},
	}),

	question: t.field({
		type: QuestionRef,
		nullable: true,
		args: { id: t.arg.id({ required: true }) },
		// Guarded before the lookup: a uuid column throws on malformed input
		// rather than just not matching, so an id that isn't one has to come
		// back as "no such question" instead of a database error. Same check
		// Query.group and Query.ballot already do.
		resolve: (_root, args) =>
			isUuid(args.id)
				? db.query.questions.findFirst({ where: { id: args.id } })
				: null,
	}),

	// The permanent public record of one call - what /calls/:id renders and
	// what every share link and the resolution digest point at. Deliberately
	// not scoped to the viewer and not gated on the question's status: a call
	// made a year before it resolves is exactly the thing worth linking to,
	// and the person opening the link usually has no account.
	call: t.field({
		type: CallRef,
		nullable: true,
		args: { id: t.arg.id({ required: true }) },
		// Same uuid guard as Query.question above, same reason.
		resolve: (_root, args) =>
			isUuid(args.id)
				? db.query.calls.findFirst({ where: { id: args.id } })
				: null,
	}),

	// The "My Calls" page - every call the viewer has made, split into an
	// Open tab (question still open/locked/disputed - no final outcome yet)
	// and a Resolved tab (question resolved or voided - settled for good). See
	// myCallCounts below for the counts shown on each tab.
	//
	// A join query with offset cursors rather than the (createdAt, id) keyset
	// db.query.calls.findMany this used to be: half the sorts and the whole
	// search order by or match on columns that live on the *question*, and
	// RQBv2 can neither sort by a relation's column (see
	// myRecentResolvedCalls below) nor reach one for an ilike. Same
	// $dynamic()/conditions-array shape as Query.questions at the top of this
	// file, for the same reasons.
	myCalls: t.field({
		type: CallConnectionRef,
		args: {
			status: t.arg({ type: CallResolutionStatus, required: true }),
			first: t.arg.int(),
			after: t.arg.string(),
			leagueId: t.arg.id(),
			shapes: t.arg({ type: [QuestionShape], required: false }),
			search: t.arg.string(),
			scope: t.arg({ type: QuestionScope, required: false }),
			// Resolved tab only - an open call has no outcome to filter on yet.
			// Applied whenever passed rather than rejected alongside status
			// OPEN, which would just be a second way to say "no rows".
			result: t.arg({ type: CallResultFilter, required: false }),
			sort: t.arg({ type: CallSortOrder, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const limit = clampPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			// Closing Soon is the Open tab's default and Points the Resolved
			// tab's: what you want off an unsettled pile is what needs you next,
			// and off a settled one, what it was worth.
			const sort =
				args.sort ?? (args.status === "resolved" ? "points" : "closing_soon")

			const query = db
				.with(callPoints)
				.select(getColumns(calls))
				.from(calls)
				.innerJoin(questions, eq(questions.id, calls.questionId))
				.leftJoin(users, eq(users.id, questions.creatorId))
				.leftJoin(teams, eq(teams.id, questions.subjectTeamId))
				.leftJoin(players, eq(players.id, questions.subjectPlayerId))
				.leftJoin(callPoints, eq(callPoints.callId, calls.id))
				.where(and(...myCallConditions(user.id, args)))
				.$dynamic()

			const rows = await query
				.orderBy(...myCallOrderKeys(sort), desc(calls.id))
				.limit(limit + 1)
				.offset(offset)
			const hasNextPage = rows.length > limit
			const items = rows.slice(0, limit)

			return {
				items,
				pageInfo: {
					hasNextPage,
					endCursor:
						items.length > 0 ? encodeOffsetCursor(offset + items.length) : null,
				},
			}
		},
	}),

	// Home's "Just resolved" - bounded to a handful, ordered by when the
	// question actually resolved (not when the call was made, unlike myCalls'
	// createdAt-desc order) so this reads as "recently decided," not "recently
	// picked." Not paginated - a small fixed list, not a page of My Calls.
	myRecentResolvedCalls: t.field({
		type: [CallRef],
		args: { first: t.arg.int({ required: false }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const limit = Math.min(Math.max(args.first ?? 5, 1), 20)
			// RQBv2's orderBy can't sort by a relation's column, and a resolved
			// call's own createdAt (when it was MADE) isn't what "recently
			// resolved" means - so this fetches with the question attached and
			// sorts on resolvedAt in application code instead of the DB. A
			// viewer's lifetime resolved-call count is small enough that this
			// isn't a real cost, unlike a site-wide query would be.
			const rows = await db.query.calls.findMany({
				where: {
					userId: user.id,
					question: { status: { in: ["resolved", "voided"] } },
				},
				with: { question: { columns: { resolvedAt: true } } },
			})
			return rows
				.filter((row) => row.question?.resolvedAt)
				.sort(
					(a, b) =>
						(b.question?.resolvedAt?.getTime() ?? 0) -
						(a.question?.resolvedAt?.getTime() ?? 0),
				)
				.slice(0, limit)
		},
	}),

	// The two tab badges on My Calls. Takes the same filters the list does (all
	// but status, which is the axis it counts across) so a filtered page's tabs
	// report what that filter actually matches instead of the lifetime totals.
	//
	// Two SQL counts rather than the "load every call the viewer ever made and
	// count in a loop" this used to do - that was already the wrong shape at a
	// few hundred rows, and it can't express the filters at all.
	myCallCounts: t.field({
		type: MyCallCountsRef,
		args: {
			leagueId: t.arg.id(),
			shapes: t.arg({ type: [QuestionShape], required: false }),
			search: t.arg.string(),
			scope: t.arg({ type: QuestionScope, required: false }),
			result: t.arg({ type: CallResultFilter, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)

			async function countFor(status: "open" | "resolved") {
				const [row] = await db
					.with(callPoints)
					.select({ value: count(calls.id) })
					.from(calls)
					.innerJoin(questions, eq(questions.id, calls.questionId))
					.leftJoin(users, eq(users.id, questions.creatorId))
					.leftJoin(teams, eq(teams.id, questions.subjectTeamId))
					.leftJoin(players, eq(players.id, questions.subjectPlayerId))
					.leftJoin(callPoints, eq(callPoints.callId, calls.id))
					.where(
						and(
							...myCallConditions(user.id, {
								...args,
								status,
								// An open call has no outcome, so a hit/miss filter would
								// match none of them and the Open badge would read 0 while
								// the tab behind it still holds calls. The filter belongs to
								// the Resolved half of this count only.
								result: status === "resolved" ? args.result : null,
							}),
						),
					)
				return row?.value ?? 0
			}

			const [open, resolved] = await Promise.all([
				countFor("open"),
				countFor("resolved"),
			])
			return { open, resolved }
		},
	}),

	// The "My Questions" page - every question the viewer has asked, across
	// every status (live, locked, resolved). Same join/offset-cursor shape as
	// myCalls above and for the same reasons; totalCount is populated here
	// because this page has no tabs to carry a count the way My Calls does.
	myQuestions: t.field({
		type: QuestionConnectionRef,
		args: {
			first: t.arg.int(),
			after: t.arg.string(),
			leagueId: t.arg.id(),
			shapes: t.arg({ type: [QuestionShape], required: false }),
			search: t.arg.string(),
			scope: t.arg({ type: QuestionScope, required: false }),
			status: t.arg({ type: QuestionStatus, required: false }),
			sort: t.arg({ type: MyQuestionSort, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const limit = clampPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sort = args.sort ?? "newest"

			const conditions = [
				eq(questions.creatorId, user.id),
				args.leagueId ? eq(questions.leagueId, args.leagueId) : undefined,
				args.status ? eq(questions.status, args.status) : undefined,
				args.shapes && args.shapes.length > 0
					? inArray(questions.shape, args.shapes)
					: undefined,
				scopeCondition(args.scope),
				// No users join here - every row's asker is the viewer, so matching
				// on their own name would just make every question match.
				args.search
					? or(
							ilike(questions.title, `%${args.search}%`),
							ilike(teams.name, `%${args.search}%`),
							ilike(teams.abbreviation, `%${args.search}%`),
							ilike(players.name, `%${args.search}%`),
						)
					: undefined,
			].filter((c) => c !== undefined)

			// Same call-count CTE Query.questions builds at the top of this file,
			// for the same reason: MOST_CALLED orders by it in SQL rather than
			// sorting a page in application code.
			const callCounts = db.$with("call_counts").as(
				db
					.select({
						questionId: calls.questionId,
						cnt: count(calls.id).as("cnt"),
					})
					.from(calls)
					.groupBy(calls.questionId),
			)

			// The same joins and conditions as the page query below, minus the
			// call-count CTE (nothing counts by it) - only the teams/players joins
			// matter, and only because `search` reaches through them.
			const totalQuery = db
				.select({ value: count(questions.id) })
				.from(questions)
				.leftJoin(teams, eq(teams.id, questions.subjectTeamId))
				.leftJoin(players, eq(players.id, questions.subjectPlayerId))
				.where(and(...conditions))

			let query = db
				.with(callCounts)
				.select(getColumns(questions))
				.from(questions)
				.leftJoin(teams, eq(teams.id, questions.subjectTeamId))
				.leftJoin(players, eq(players.id, questions.subjectPlayerId))
				.leftJoin(callCounts, eq(callCounts.questionId, questions.id))
				.where(and(...conditions))
				.$dynamic()

			query = match(sort)
				// Ordering only, no window filter - unlike Query.questions'
				// same-named sort. Your own question stays on this page after it
				// locks; the leading boolean just sorts already-locked ones behind
				// everything still coming up.
				.with("closing_soon", () =>
					query.orderBy(
						asc(sql`(${questions.locksAt} <= now())`),
						asc(questions.locksAt),
						desc(questions.id),
					),
				)
				.with("most_called", () =>
					query.orderBy(
						desc(sql`coalesce(${callCounts.cnt}, 0)`),
						desc(questions.id),
					),
				)
				.with("newest", () =>
					query.orderBy(desc(questions.createdAt), desc(questions.id)),
				)
				.exhaustive()

			const [rows, [totals]] = await Promise.all([
				query.limit(limit + 1).offset(offset),
				totalQuery,
			])
			const hasNextPage = rows.length > limit
			const items = rows.slice(0, limit)

			return {
				items,
				totalCount: totals?.value ?? 0,
				pageInfo: {
					hasNextPage,
					endCursor:
						items.length > 0 ? encodeOffsetCursor(offset + items.length) : null,
				},
			}
		},
	}),

	// Queue tab. "Needs resolution" / "probably still live" only ever considers
	// game-scoped questions (gameId set) that are still unresolved (open, or
	// flipped to locked by lock-overdue-questions) past their locksAt - season-long questions (MVP, championship) have no single game
	// to estimate a "likely over" guess off of, and aren't time-sensitive the
	// same way, so they're resolved manually elsewhere and never show up here.
	adminQueueSummary: t.field({
		type: AdminQueueSummaryRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		resolve: async (_root, _args, ctx) => {
			requireAdmin(ctx)
			const now = new Date()

			const lockedOpenQuestions = await db
				.select({ ...getColumns(questions), leagueSlug: leagues.slug })
				.from(questions)
				.innerJoin(leagues, eq(leagues.id, questions.leagueId))
				.where(
					and(
						eq(questions.resolutionMode, "manual"),
						inArray(questions.status, ["open", "locked"]),
						isNotNull(questions.gameId),
						lte(questions.locksAt, now),
					),
				)

			const needsResolution: Question[] = []
			const probablyStillLive: Question[] = []
			for (const question of lockedOpenQuestions) {
				const hoursSinceLock =
					(now.getTime() - question.locksAt.getTime()) / (1000 * 60 * 60)
				const typicalHours = typicalGameLengthHours(question.leagueSlug)
				;(hoursSinceLock >= typicalHours
					? needsResolution
					: probablyStillLive
				).push(question)
			}

			const disputed = await db.query.resolutionDisputes.findMany({
				where: { status: "open" },
				orderBy: { createdAt: "asc" },
			})

			const reported = await db.query.questionReports.findMany({
				where: { status: "open" },
				orderBy: { createdAt: "asc" },
			})

			// System questions the resolver handed over, plus any whose game has
			// sat unfinished a day past lock (postponed, suspended) - the resolver
			// only reads a game once it's final, so those never reach it.
			const [escalated, stuck] = await Promise.all([
				db.query.questions.findMany({
					where: {
						resolutionMode: "system",
						status: { in: ["open", "locked"] },
						autoResolution: { escalatedAt: { isNotNull: true } },
					},
					with: { autoResolution: true },
					orderBy: { locksAt: "asc" },
				}),
				db.query.questions.findMany({
					where: {
						resolutionMode: "system",
						status: { in: ["open", "locked"] },
						locksAt: { lte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
						game: { status: { ne: "final" } },
					},
					orderBy: { locksAt: "asc" },
				}),
			])
			const autoResolveEscalated = [
				...escalated.map(({ autoResolution, ...question }) => ({
					question,
					failureReason: autoResolution?.failureReason ?? null,
					failureDetail: autoResolution?.failureDetail ?? null,
				})),
				...stuck.map((question) => ({
					question,
					failureReason: null,
					failureDetail: "The game hasn't gone final a day after lock.",
				})),
			]

			const [{ n: liveQuestionsCount }] = await db
				.select({ n: count() })
				.from(questions)
				.where(eq(questions.status, "open"))
			const [{ n: usersLockedCount }] = await db
				.select({ n: count() })
				.from(users)
				.where(eq(users.questionCreationEnabled, false))

			return {
				needsResolution,
				probablyStillLive,
				autoResolveEscalated,
				disputed,
				reported,
				liveQuestionsCount,
				usersLockedCount,
			}
		},
	}),
}))
