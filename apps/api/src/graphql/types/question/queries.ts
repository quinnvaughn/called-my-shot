import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	getColumns,
	gt,
	inArray,
	isNotNull,
	isNull,
	lte,
	ne,
	notInArray,
	or,
	sql,
} from "drizzle-orm"
import { DateTime } from "luxon"
import { match } from "ts-pattern"
import { db } from "../../../db"
import {
	callSelections,
	calls,
	games,
	leagues,
	type Question,
	questionOptions,
	questions,
	users,
} from "../../../db/schema"
import {
	adminListArgs,
	buildAdminConnection,
	sortColumn,
} from "../../../lib/admin-pagination"
import { requireAdmin, requireUser } from "../../../lib/auth"
import { AuthenticationError, AuthorizationError } from "../../../lib/errors"
import { typicalGameLengthHours } from "../../../lib/game-length"
import { clampPageSize, decodeOffsetCursor } from "../../../lib/pagination"
import {
	callCountOf,
	callCountsCte,
	DECIDED_STATUSES,
	joinQuestionPeople,
	notInABallot,
	questionFilters,
	questionSearch,
	SEASON_AWARD_SHAPES,
	SETTLED_STATUSES,
	UNRESOLVED_STATUSES,
} from "../../../lib/question-queries"
import { getCurrentSeason } from "../../../lib/seasons"
import { DAY_MS, HOUR_MS } from "../../../lib/time"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import { clampTypeahead } from "../../helpers"
import { SortDirection } from "../pagination"
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

type MyCallFilters = {
	status: "open" | "resolved"
	leagueId?: string | null
	shapes?: readonly Question["shape"][] | null
	search?: string | null
	scope?: "game" | "season_long" | null
	result?: "hit" | "miss" | "unscored" | null
}

// Shared by myCalls and myCallCounts so the list and the tab badges above it
// can't disagree about what the current filter matches. Expects the question's
// people joined in (see joinQuestionPeople) for the search.
function myCallConditions(userId: string, filters: MyCallFilters) {
	return [
		eq(calls.userId, userId),
		filters.status === "resolved"
			? inArray(questions.status, [...SETTLED_STATUSES])
			: notInArray(questions.status, [...SETTLED_STATUSES]),
		// filters.status is the My Calls tab (handled above), not a question status.
		...questionFilters({
			leagueId: filters.leagueId,
			shapes: filters.shapes,
			scope: filters.scope,
		}),
		questionSearch(filters.search, { creator: true, subjects: true }),
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
	]
}

// A call whose question hangs off a game that is being played right now.
// Query.myLiveCalls selects on it and Query.myCalls excludes it, so the two
// can't disagree about which rows the "Playing now" section has taken off the
// list. A season-long call has no game at all, and so is never live.
const callGameIsLive = sql`${games.status} = 'live'`

// See Query.myLiveCalls - a backstop, not a page size. The largest single
// slate in any synced league is well under this.
const MY_LIVE_CALLS_CAP = 50

// My Calls' ordering keys, with the calls.id tiebreak running the same way as
// the sort. Nulls (an unscored call's points) stay last in both directions: a
// row with nothing to rank on isn't the lowest value, and flipping the list
// shouldn't drag every one of them to the top.
function myCallOrderKeys(
	sort: "date" | "points" | "conviction",
	direction: "asc" | "desc",
) {
	const dir = direction === "asc" ? sql`asc` : sql`desc`
	const tiebreak = direction === "asc" ? asc(calls.id) : desc(calls.id)
	return match(sort)
		.with("date", () => [
			direction === "asc" ? asc(calls.createdAt) : desc(calls.createdAt),
			tiebreak,
		])
		.with("points", () => [sql`${callTotalPoints} ${dir} nulls last`, tiebreak])
		.with("conviction", () => [
			sql`${callConviction} ${dir} nulls last`,
			tiebreak,
		])
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
				...questionFilters(args),
				args.gameId ? eq(questions.gameId, args.gameId) : undefined,
				typeof args.isOfficial === "boolean"
					? eq(questions.isOfficial, args.isOfficial)
					: undefined,
				// A series question has no game either, but it belongs with the
				// series' games rather than the season - see questions.seriesId.
				args.seasonLong
					? and(isNull(questions.gameId), isNull(questions.seriesId))
					: undefined,
				currentSeason ? eq(questions.seasonId, currentSeason.id) : undefined,
				args.excludeBallotMembers ? notInABallot() : undefined,
				args.excludeLocked
					? notInArray(questions.status, ["locked", "voided"])
					: undefined,
				args.excludeGameWinners
					? ne(questions.shape, "team_vs_team")
					: undefined,
				args.excludeSeasonAwards
					? notInArray(questions.shape, [...SEASON_AWARD_SHAPES])
					: undefined,
				args.excludeSettled
					? notInArray(questions.status, [...DECIDED_STATUSES])
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
				questionSearch(args.search, { creator: true, subjects: true }),
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
			]

			// Joined in rather than computed with t.relatedCount (as
			// QuestionRef.callCount does) so MOST_CALLED can ORDER BY it directly
			// instead of sorting the page in application code.
			const callCounts = callCountsCte()

			const rows = await joinQuestionPeople(
				db
					.with(callCounts)
					.select(getColumns(questions))
					.from(questions)
					.$dynamic(),
			)
				.leftJoin(callCounts, eq(callCounts.questionId, questions.id))
				.where(and(...conditions))
				.orderBy(
					...match(sort)
						// Second key is locksAt, not just id - a sync run can insert a
						// whole batch (e.g. every game entering syncGameQuestions'
						// creation window in one run - see apps/api/src/db/sync/
						// sync-game-questions.ts) with createdAt values only
						// microseconds apart, and id (random per row) wouldn't
						// resolve that into anything sensible. locksAt ascending
						// means a same-instant batch still reads soonest-first
						// within itself, same "what's actually coming up" ordering
						// CLOSING_SOON uses on its own.
						.with("new", () => [
							desc(questions.createdAt),
							asc(questions.locksAt),
							desc(questions.id),
						])
						.with("closing_soon", () => [
							asc(questions.locksAt),
							desc(questions.id),
						])
						.with("most_called", () => [
							desc(callCountOf(callCounts)),
							desc(questions.id),
						])
						.exhaustive(),
				)
				.limit(limit + 1)
				.offset(offset)
			return buildAdminConnection(rows, limit, offset)
		},
	}),

	// The landing page hero's try-it stack, for signed-out visitors.
	//
	// Deliberately not the `questions` field above with sort: CLOSING_SOON.
	// That sort ranks every league on one list and bounds itself to the next 48
	// hours, both of which are right for a "what's about to lock" feed and
	// wrong here: in September, baseball fills the window several times over
	// before football's next Sunday even qualifies, and basketball's whole
	// season sits months outside it. A visitor who only watches one of those
	// gets offered nothing they have an opinion on.
	//
	// So: the soonest `perLeague` still-callable questions from every active
	// league that has any, no time bound at all. A game a month out is a fine
	// first call - it locks when that game starts like any other, and calling
	// that far ahead of the field is worth more, not less. The hero opens on
	// one league and its chip row switches between the rest (see the web side's
	// select-guest-picks.ts).
	guestPickQuestions: t.field({
		type: [QuestionRef],
		args: {
			// Per league, not overall. The stack only ever shows three at a
			// time; the rest are what Skip draws on, and they have to stay
			// inside the league the visitor chose to be worth anything.
			perLeague: t.arg.int(),
			shapes: t.arg({ type: [QuestionShape], required: false }),
		},
		resolve: async (_root, args) => {
			const perLeague = Math.max(1, Math.min(args.perLeague ?? 8, 25))
			// Matches MIN_LEAD_MS on the web side, which drops anything closer
			// than this because a pick has to survive the visitor filling in the
			// sign-up form. Applied here too so a league whose next few questions
			// are all about to lock still contributes `perLeague` usable ones
			// instead of silently losing its chip.
			const earliest = DateTime.now().plus({ minutes: 20 }).toJSDate()

			const ranked = db
				.select({
					...getColumns(questions),
					rank: sql<number>`row_number() over (
						partition by ${questions.leagueId}
						order by ${questions.locksAt} asc, ${questions.id} desc
					)`.as("rank"),
				})
				.from(questions)
				.innerJoin(leagues, eq(leagues.id, questions.leagueId))
				.where(
					and(
						eq(questions.isOfficial, true),
						eq(questions.status, "open"),
						eq(leagues.status, "active"),
						gt(questions.locksAt, earliest),
						args.shapes && args.shapes.length > 0
							? inArray(questions.shape, args.shapes)
							: undefined,
					),
				)
				.as("ranked")

			return db
				.select()
				.from(ranked)
				.where(lte(ranked.rank, perLeague))
				.orderBy(asc(ranked.locksAt), desc(ranked.id))
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
	// ranks by MOST_CALLED/NEW/CLOSING_SOON).
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
			const { limit, offset, sortDir } = adminListArgs(ctx, args)
			const sortBy = args.sortBy ?? "title"

			const callCounts = callCountsCte()
			const rows = await db
				.with(callCounts)
				.select(getColumns(questions))
				.from(questions)
				.leftJoin(users, eq(users.id, questions.creatorId))
				.leftJoin(callCounts, eq(callCounts.questionId, questions.id))
				.where(
					and(
						...questionFilters(args),
						args.unassignedToBallot ? notInABallot() : undefined,
						questionSearch(args.search, { creator: true, subjects: false }),
					),
				)
				.orderBy(
					match(sortBy)
						.with("asker", () => sortColumn(sortDir, users.username))
						.with("callers", () =>
							sortDir === "asc"
								? asc(callCountOf(callCounts))
								: desc(callCountOf(callCounts)),
						)
						.with("shape", () => sortColumn(sortDir, questions.shape))
						.with("status", () => sortColumn(sortDir, questions.status))
						.with("title", () => sortColumn(sortDir, questions.title))
						.exhaustive(),
					asc(questions.id),
				)
				.limit(limit + 1)
				.offset(offset)
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
			// Every sort defaults to descending: newest, most points, most
			// conviction first.
			direction: t.arg({ type: SortDirection, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const limit = clampPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			// Date is the Open tab's default and Points the Resolved tab's:
			// off an unsettled pile you want what you just called, and off a
			// settled one, what it was worth. What's playing out right now isn't
			// in this list at all - see myLiveCalls below.
			const sort = args.sort ?? (args.status === "resolved" ? "points" : "date")
			const direction = args.direction ?? "desc"

			const rows = await joinQuestionPeople(
				db
					.with(callPoints)
					.select(getColumns(calls))
					.from(calls)
					.innerJoin(questions, eq(questions.id, calls.questionId))
					.$dynamic(),
			)
				.leftJoin(callPoints, eq(callPoints.callId, calls.id))
				// Null for a season-long question, which hangs off no game.
				.leftJoin(games, eq(games.id, questions.gameId))
				.where(
					and(
						...myCallConditions(user.id, args),
						// The Open tab renders its live calls as a pinned section above
						// this list (myLiveCalls below), so leaving them in would show
						// each of them twice. myCallCounts deliberately still counts
						// them: the tab badge describes the tab, not this one list.
						args.status === "open"
							? sql`(${callGameIsLive}) is not true`
							: undefined,
					),
				)
				.orderBy(...myCallOrderKeys(sort, direction))
				.limit(limit + 1)
				.offset(offset)
			return buildAdminConnection(rows, limit, offset)
		},
	}),

	// The "Playing now" section pinned above the Open tab's list - the viewer's
	// calls whose game is in flight right now. These rows are excluded from
	// myCalls above, so the two together are the whole Open tab exactly once.
	//
	// A section rather than one of myCalls' sort orders, which is what this
	// used to be. As a sort it had nothing to hoist on any day the viewer had
	// no game in flight - which is most days - and fell through to ordering by
	// locksAt, so picking "Live" produced the identical list to a closing-soon
	// ordering and the control read as broken. A section is simply absent when
	// there's nothing live, which is the honest rendering of the same fact.
	//
	// Not a connection: a viewer can only have as many live calls as there are
	// games in flight, so this is a naturally small set. The cap is a
	// backstop against a pathological account, not real pagination.
	myLiveCalls: t.field({
		type: [CallRef],
		args: {
			leagueId: t.arg.id(),
			shapes: t.arg({ type: [QuestionShape], required: false }),
			search: t.arg.string(),
			scope: t.arg({ type: QuestionScope, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			return (
				joinQuestionPeople(
					db
						.select(getColumns(calls))
						.from(calls)
						.innerJoin(questions, eq(questions.id, calls.questionId))
						.$dynamic(),
				)
					.innerJoin(games, eq(games.id, questions.gameId))
					.where(
						and(
							...myCallConditions(user.id, { ...args, status: "open" }),
							callGameIsLive,
						),
					)
					// Earliest start first, so the game closest to finishing - the one
					// whose outcome is about to be decided - sits on top.
					.orderBy(asc(games.startsAt), desc(calls.id))
					.limit(MY_LIVE_CALLS_CAP)
			)
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
			const limit = clampTypeahead(args.first, 5)
			// RQBv2's orderBy can't sort by a relation's column, and a resolved
			// call's own createdAt (when it was MADE) isn't what "recently
			// resolved" means - so this fetches with the question attached and
			// sorts on resolvedAt in application code instead of the DB. A
			// viewer's lifetime resolved-call count is small enough that this
			// isn't a real cost, unlike a site-wide query would be.
			const rows = await db.query.calls.findMany({
				where: {
					userId: user.id,
					question: { status: { in: [...SETTLED_STATUSES] } },
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
				const [row] = await joinQuestionPeople(
					db
						.with(callPoints)
						.select({ value: count(calls.id) })
						.from(calls)
						.innerJoin(questions, eq(questions.id, calls.questionId))
						.$dynamic(),
				)
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
			// DATE only, defaulting to newest first. CLOSING_SOON and
			// MOST_CALLED ignore it - see MyQuestionSort.
			direction: t.arg({ type: SortDirection, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const limit = clampPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sort = args.sort ?? "date"
			const direction = args.direction ?? "desc"

			const conditions = and(
				eq(questions.creatorId, user.id),
				...questionFilters(args),
				// No users join here - every row's asker is the viewer, so matching
				// on their own name would just make every question match.
				questionSearch(args.search, { creator: false, subjects: true }),
			)

			// The same joins and conditions as the page query below, minus the
			// call-count CTE (nothing counts by it) - only the teams/players joins
			// matter, and only because `search` reaches through them.
			const totalQuery = joinQuestionPeople(
				db
					.select({ value: count(questions.id) })
					.from(questions)
					.$dynamic(),
				{ creator: false },
			).where(conditions)

			// Same call-count CTE Query.questions uses, for the same reason:
			// MOST_CALLED orders by it in SQL rather than sorting a page in
			// application code.
			const callCounts = callCountsCte()
			const pageQuery = joinQuestionPeople(
				db
					.with(callCounts)
					.select(getColumns(questions))
					.from(questions)
					.$dynamic(),
				{ creator: false },
			)
				.leftJoin(callCounts, eq(callCounts.questionId, questions.id))
				.where(conditions)
				.orderBy(
					...match(sort)
						// Ordering only, no window filter - unlike Query.questions'
						// same-named sort. Your own question stays on this page after it
						// locks; the leading boolean just sorts already-locked ones behind
						// everything still coming up.
						.with("closing_soon", () => [
							asc(sql`(${questions.locksAt} <= now())`),
							asc(questions.locksAt),
							desc(questions.id),
						])
						.with("most_called", () => [
							desc(callCountOf(callCounts)),
							desc(questions.id),
						])
						.with("date", () =>
							direction === "asc"
								? [asc(questions.createdAt), asc(questions.id)]
								: [desc(questions.createdAt), desc(questions.id)],
						)
						.exhaustive(),
				)

			const [rows, [totals]] = await Promise.all([
				pageQuery.limit(limit + 1).offset(offset),
				totalQuery,
			])
			return {
				...buildAdminConnection(rows, limit, offset),
				totalCount: totals?.value ?? 0,
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

			const [
				lockedOpenQuestions,
				disputed,
				reported,
				escalated,
				stuck,
				[{ n: liveQuestionsCount }],
				[{ n: usersLockedCount }],
			] = await Promise.all([
				db
					.select({ ...getColumns(questions), leagueSlug: leagues.slug })
					.from(questions)
					.innerJoin(leagues, eq(leagues.id, questions.leagueId))
					.where(
						and(
							eq(questions.resolutionMode, "manual"),
							inArray(questions.status, [...UNRESOLVED_STATUSES]),
							isNotNull(questions.gameId),
							lte(questions.locksAt, now),
						),
					),
				db.query.resolutionDisputes.findMany({
					where: { status: "open" },
					orderBy: { createdAt: "asc" },
				}),
				db.query.questionReports.findMany({
					where: { status: "open" },
					orderBy: { createdAt: "asc" },
				}),
				// System questions the resolver handed over, plus any whose game
				// has sat unfinished a day past lock (postponed, suspended) - the
				// resolver only reads a game once it's final, so those never
				// reach it.
				db.query.questions.findMany({
					where: {
						resolutionMode: "system",
						status: { in: [...UNRESOLVED_STATUSES] },
						autoResolution: { escalatedAt: { isNotNull: true } },
					},
					with: { autoResolution: true },
					orderBy: { locksAt: "asc" },
				}),
				db.query.questions.findMany({
					where: {
						resolutionMode: "system",
						status: { in: [...UNRESOLVED_STATUSES] },
						locksAt: { lte: new Date(now.getTime() - DAY_MS) },
						game: { status: { ne: "final" } },
					},
					orderBy: { locksAt: "asc" },
				}),
				db
					.select({ n: count() })
					.from(questions)
					.where(eq(questions.status, "open")),
				db
					.select({ n: count() })
					.from(users)
					.where(eq(users.questionCreationEnabled, false)),
			])

			const needsResolution: Question[] = []
			const probablyStillLive: Question[] = []
			for (const question of lockedOpenQuestions) {
				const hoursSinceLock =
					(now.getTime() - question.locksAt.getTime()) / HOUR_MS
				const typicalHours = typicalGameLengthHours(question.leagueSlug)
				;(hoursSinceLock >= typicalHours
					? needsResolution
					: probablyStillLive
				).push(question)
			}

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
