import {
	fieldPct,
	isNumericGuessShape,
	SHAPE_LABEL,
	STREAK_FAMILY_LABEL,
	STREAK_TAG_MIN,
	streakFamilyFor,
} from "@called-my-shot/scoring"
import { and, eq, inArray } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../../../db"
import {
	groupMembers,
	type LiveOptionValue,
	type Question,
	type QuestionLiveReading,
	questionShares,
	type UserStreak,
} from "../../../db/schema"
import { loadCardFacts } from "../../../lib/card-fact/build"
import { keysetPaginate } from "../../../lib/pagination"
import { buildStatContext } from "../../../lib/stat-context/build"
import { countsTowardAchievements } from "../../../lib/streaks/enqueue"
import type { TrackRecordSide } from "../../../lib/track-record/compute"
import {
	loadTrackRecord,
	type TrackRecordRow,
} from "../../../lib/track-record/load"
import { builder } from "../../builder"
import { groupByKey, indexByKey } from "../../loader"
import { BallotQuestionRef } from "../ballot"
import { type Connection, PageInfoRef } from "../pagination"
import { StreakFamilyEnum } from "../user/enums"
import { CallConnectionRef, CallRef } from "./call"
import { CardFactRef } from "./card-fact"
import {
	AwardVerb,
	QuestionShape,
	QuestionStatus,
	QuestionVoidedReason,
	ResolutionMethod,
	StatAggregation,
} from "./enums"
import { GroupPickTallyRef, loadViewerGroupPicks } from "./group-picks"
import {
	loadQuestionFacts,
	loadSeasonWindow,
	optionConvictionLoader,
	optionSelectionCountLoader,
	questionCallCountLoader,
	questionFieldConvictionLoader,
	questionGuessCallsLoader,
	scoredOptionsLoader,
	viewerStreakLoader,
} from "./loaders"
import { QuestionReportRef, ResolutionDisputeRef } from "./moderation-objects"
import { paceFor, SeasonPlayRef } from "./season-play"
import { questionSeriesStage, SeriesStageRef } from "./series-stage"
import { StatContextRef } from "./stat-context"

// The viewer's streak a question's result would extend or end - see
// Question.viewerStreak.
const StreakStakeRef = builder.objectRef<UserStreak>("StreakStake").implement({
	fields: (t) => ({
		family: t.field({ type: StreakFamilyEnum, resolve: (s) => s.family }),
		familyLabel: t.field({
			type: "String",
			resolve: (s) => STREAK_FAMILY_LABEL[s.family],
		}),
		currentLength: t.exposeInt("currentLength"),
		bestLength: t.exposeInt("bestLength"),
	}),
})

const TrackRecordSideRef = builder
	.objectRef<TrackRecordSide>("TrackRecordSide")
	.implement({
		fields: (t) => ({
			label: t.exposeString("label"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			netPoints: t.exposeInt("netPoints"),
		}),
	})

const TrackRecordRowRef = builder
	.objectRef<TrackRecordRow>("TrackRecordRow")
	.implement({
		fields: (t) => ({
			label: t.exposeString("label", { nullable: true }),
			sides: t.field({ type: [TrackRecordSideRef], resolve: (r) => r.sides }),
		}),
	})

// The viewer's record picking each option of a two-option question - see
// Question.viewerTrackRecord. Labels ride along so the client never has to
// resolve a stat or subject name itself.
const TrackRecordRef = builder
	.objectRef<{ label: string; rows: TrackRecordRow[] }>("TrackRecord")
	.implement({
		fields: (t) => ({
			// The stat these calls share, or the shape's name when there's no
			// stat, like a yes/no prop.
			label: t.exposeString("label"),
			rows: t.field({ type: [TrackRecordRowRef], resolve: (r) => r.rows }),
		}),
	})

export const QuestionOptionRef = builder.drizzleObject("questionOptions", {
	name: "QuestionOption",
	fields: (t) => ({
		id: t.exposeID("id"),
		label: t.exposeString("label"),
		sortOrder: t.exposeInt("sortOrder"),
		// set when this option actually is a real team or player (a championship
		// field, an All-NBA ballot) - null for freeform options like Yes/No
		team: t.relation("team", { nullable: true }),
		player: t.relation("player", { nullable: true }),
		// null until the question resolves
		isCorrect: t.exposeBoolean("isCorrect", { nullable: true }),
		// What this option's own player or team actually put up - set on the
		// head-to-head and leader shapes, whose result is a comparison between
		// the options. Null on every other shape and on a hand-entered result.
		actualValue: t.exposeFloat("actualValue", { nullable: true }),
		// A miss's loss rate on this side alone, set when the question's sides
		// were priced. Null scores at the question's lossRate.
		lossRate: t.exposeFloat("lossRate", { nullable: true }),
		// What a hit on this side pays as a multiple of committed, before the
		// boldness and early bonuses, set when its sides were priced. Null pays
		// 1.
		winMult: t.exposeFloat("winMult", { nullable: true }),
		// The model's chance this side hits, set alongside lossRate. The rarity
		// multiplier measures the field against it - see tierFor.
		modelHitRate: t.exposeFloat("modelHitRate", { nullable: true }),
		callCount: t.relatedCount("selections"),
		// live % of the question's callers who picked this option - same formula
		// resolution scores against at lock (see fieldPct in @called-my-shot/scoring),
		// just evaluated whenever this is queried instead of frozen at any one moment.
		fieldPct: t.field({
			type: "Float",
			nullable: true,
			resolve: async (option, _args, ctx) => {
				const [selectionCount, questionCallCount] = await Promise.all([
					optionSelectionCountLoader(ctx).load(option.id),
					questionCallCountLoader(ctx).load(option.questionId),
				])
				if (questionCallCount === 0) return null
				return fieldPct(selectionCount, questionCallCount)
			},
		}),
		// The field's conviction behind this option, which the boldness tier
		// reads its share off - see crowdTotals.
		convictionTotal: t.int({
			resolve: (option, _args, ctx) =>
				optionConvictionLoader(ctx).load(option.id),
		}),
		// This option's share of the field's conviction, the share the
		// boldness tier is scored against. Null until anyone has called.
		crowdPct: t.field({
			type: "Float",
			nullable: true,
			resolve: async (option, _args, ctx) => {
				const [optionConviction, fieldConviction] = await Promise.all([
					optionConvictionLoader(ctx).load(option.id),
					questionFieldConvictionLoader(ctx).load(option.questionId),
				])
				if (fieldConviction === 0) return null
				return fieldPct(optionConviction, fieldConviction)
			},
		}),
	}),
})

const GuessBucketRef = builder
	.objectRef<{ value: number; count: number }>("GuessBucket")
	.implement({
		fields: (t) => ({
			value: t.exposeFloat("value"),
			count: t.exposeInt("count"),
		}),
	})

// Shared by the top-level questions feed below and group/refs.ts's createdQuestions
// - both are lists of full Question rows, just filtered differently.
export const QuestionConnectionRef = builder
	.objectRef<Connection<Question>>("QuestionConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [QuestionRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
			// Null on every connection but myQuestions, which is the only caller
			// that shows a total - see totalCount on Connection in ../pagination.ts.
			totalCount: t.int({
				nullable: true,
				resolve: (c) => c.totalCount ?? null,
			}),
		}),
	})

export const MyCallCountsRef = builder
	.objectRef<{ open: number; resolved: number }>("MyCallCounts")
	.implement({
		fields: (t) => ({
			open: t.exposeInt("open"),
			resolved: t.exposeInt("resolved"),
		}),
	})

const LiveOptionValueRef = builder
	.objectRef<LiveOptionValue>("LiveOptionValue")
	.implement({
		fields: (t) => ({
			optionId: t.exposeID("optionId"),
			value: t.exposeFloat("value", { nullable: true }),
		}),
	})

const LiveReadingRef = builder
	.objectRef<QuestionLiveReading>("LiveReading")
	.implement({
		fields: (t) => ({
			value: t.exposeFloat("value", { nullable: true }),
			optionValues: t.field({
				type: [LiveOptionValueRef],
				nullable: true,
				resolve: (r) => r.optionValues,
			}),
			updatedAt: t.field({ type: "DateTime", resolve: (r) => r.updatedAt }),
		}),
	})

export const QuestionRef = builder.drizzleObject("questions", {
	name: "Question",
	fields: (t) => ({
		id: t.exposeID("id"),
		shape: t.field({ type: QuestionShape, resolve: (q) => q.shape }),
		title: t.exposeString("title"),
		isOfficial: t.exposeBoolean("isOfficial"),
		// Whether its sides carry the model's price. With isOfficial and
		// shape, what sets its base - see basePointsFor.
		isPriced: t.boolean({
			resolve: async (question, _args, ctx) =>
				(await loadQuestionFacts(ctx, question.id))?.isPriced ?? false,
		}),

		// manual resolution - a human states where they checked, in their own
		// words, rather than picking from a fixed source list
		resolutionSource: t.exposeString("resolutionSource"),
		resolutionSourceUrl: t.exposeString("resolutionSourceUrl", {
			nullable: true,
		}),

		locksAt: t.field({
			type: "DateTime",
			resolve: (q) => q.locksAt,
		}),
		status: t.field({ type: QuestionStatus, resolve: (q) => q.status }),
		resolvedAt: t.field({
			type: "DateTime",
			nullable: true,
			resolve: (q) => q.resolvedAt,
		}),
		resolutionNote: t.exposeString("resolutionNote", { nullable: true }),
		// True when ESPN data settles the question rather than a person - see
		// resolutionMode on the questions table.
		resolvesAutomatically: t.boolean({
			resolve: (q) => q.resolutionMode === "system",
		}),
		// Who set the current result - null until there is one.
		resolutionMethod: t.field({
			type: ResolutionMethod,
			nullable: true,
			resolve: (q) => q.resolutionMethod,
		}),
		// Why a VOIDED question was voided - null for every other status.
		voidedReason: t.field({
			type: QuestionVoidedReason,
			nullable: true,
			resolve: (q) => q.voidedReason,
		}),

		// The single real-world matchup this question is about - null for
		// anything not scoped to one game (season awards, an MVP race).
		game: t.relation("game", { nullable: true }),
		// The postseason series a series-long question is about ("who wins the
		// series?") - null for everything else, game questions included.
		series: t.relation("series", { nullable: true }),

		// *_over_under, *_numeric_guess, and player_vs_player only - stat is the
		// catalog-backed default, customStat is the escape hatch used when stat
		// is null (never set for the two numeric-guess shapes, which require a
		// catalog stat)
		stat: t.relation("stat", { nullable: true }),
		customStat: t.exposeString("customStat", { nullable: true }),

		// *_over_under shapes only
		ouLine: t.exposeFloat("ouLine", { nullable: true }),

		// player_season_stat_over_under/team_season_stat_over_under only
		statAggregation: t.field({
			type: StatAggregation,
			nullable: true,
			resolve: (q) => q.statAggregation,
		}),

		// player_stat_over_under/numeric_guess, team_stat_over_under/
		// numeric_guess (required), yes_no_prop (optional - null for a
		// subject-less proposition)
		subjectTeam: t.relation("subjectTeam", { nullable: true }),
		subjectPlayer: t.relation("subjectPlayer", { nullable: true }),

		// yes_no_prop only
		eventClause: t.exposeString("eventClause", { nullable: true }),

		// player_season_award/team_season_award/player_award_finalists only
		awardName: t.exposeString("awardName", { nullable: true }),

		// player_season_award/team_season_award only - see AwardVerb above.
		awardVerb: t.field({
			type: AwardVerb,
			nullable: true,
			resolve: (q) => q.awardVerb,
		}),

		// player_season_award/team_season_award only - the conference/division/
		// position values the pool was narrowed to (IN filtering) at creation
		// time, if any.
		awardConferences: t.field({
			type: ["String"],
			nullable: true,
			resolve: (q) => q.awardConferences,
		}),
		awardDivisions: t.field({
			type: ["String"],
			nullable: true,
			resolve: (q) => q.awardDivisions,
		}),
		awardPositions: t.field({
			type: ["String"],
			nullable: true,
			resolve: (q) => q.awardPositions,
		}),
		awardSeasonsInLeague: t.field({
			type: ["Int"],
			nullable: true,
			resolve: (q) => q.awardSeasonsInLeague,
		}),
		awardRookieOnly: t.field({
			type: "Boolean",
			nullable: true,
			resolve: (q) => q.awardRookieOnly,
		}),

		// The two numeric-guess shapes only. Exactly one of numericTolerancePct/
		// numericToleranceAbsolute is set, depending on the picked stat's
		// tolerance tier mode (see ToleranceSpec in @called-my-shot/scoring).
		numericTolerancePct: t.exposeFloat("numericTolerancePct", {
			nullable: true,
		}),
		numericToleranceAbsolute: t.exposeFloat("numericToleranceAbsolute", {
			nullable: true,
		}),
		// The share of committed points a miss costs, saved on the question when
		// it was created.
		lossRate: t.exposeFloat("lossRate"),
		numericActualValue: t.exposeFloat("numericActualValue", { nullable: true }),
		// live average of every guessValue submitted so far - numeric-guess
		// shapes only, null until at least one call exists
		averageGuess: t.field({
			type: "Float",
			nullable: true,
			resolve: async (question, _args, ctx) => {
				const calls = await questionGuessCallsLoader(ctx).load(question.id)
				const guesses = calls
					.map((call) => call.guessValue)
					.filter((value): value is number => value !== null)
				if (guesses.length === 0) return null
				return guesses.reduce((sum, value) => sum + value, 0) / guesses.length
			},
		}),

		// % of calls that landed within tolerance, once resolved - numeric_guess
		// only, null until at least one call has been scored. An aggregate like
		// averageGuess above, so it bypasses the per-call hitTolerance privacy
		// gate (see CallRef.hitTolerance) without attributing the result to any
		// one caller.
		numericHitRatePct: t.field({
			type: "Float",
			nullable: true,
			resolve: async (question, _args, ctx) => {
				const calls = await questionGuessCallsLoader(ctx).load(question.id)
				const scored = calls.filter(
					(call): call is typeof call & { hitTolerance: boolean } =>
						call.hitTolerance !== null,
				)
				if (scored.length === 0) return null
				const hits = scored.filter((call) => call.hitTolerance).length
				return (hits / scored.length) * 100
			},
		}),

		// Season-long shapes only (see SEASON_LONG_SHAPES/isSeasonLongShape in
		// @called-my-shot/scoring) - games already final as of right now (not any
		// particular call's createdAt, since this is the live preview shown
		// while still picking, before a call necessarily exists - see
		// CallRef.seasonGamesPlayed for the per-call, frozen-at-createdAt
		// counterpart used once a call is real). Bounded by both "now" and this
		// question's own locksAt so a query that lands after lock (but before
		// resolution) can't overcount games that happened after the real cutoff
		// any eventual call would have been scored against.
		seasonGamesPlayed: t.field({
			type: "Int",
			nullable: true,
			resolve: async (question, _args, ctx) => {
				const window = await loadSeasonWindow(ctx, question, new Date())
				return window?.played ?? null
			},
		}),
		// Total games in the same window seasonGamesPlayed counts against -
		// games scheduled between season start and this question's own locksAt,
		// matching CallRef.seasonTotalGames's window exactly.
		seasonTotalGames: t.field({
			type: "Int",
			nullable: true,
			resolve: async (question, _args, ctx) => {
				const window = await loadSeasonWindow(ctx, question, new Date())
				return window?.total ?? null
			},
		}),

		// player_season_award/team_season_award only
		picksRequired: t.exposeInt("picksRequired", { nullable: true }),

		createdAt: t.field({
			type: "DateTime",
			resolve: (q) => q.createdAt,
		}),

		creator: t.relation("creator", { nullable: true }),
		sport: t.relation("sport"),
		league: t.relation("league"),
		// sortOrder is set once at creation (see castQuestion/castCall) to the
		// order the creator/pool actually presented them in - nothing else on
		// questionOptions gives a stable, intentional order, so every consumer
		// of this list (the live picker, the resolve modal, the field
		// breakdown) sees the same one rather than whatever order Postgres
		// happens to return without an explicit sort.
		options: t.relation("options", {
			query: () => ({ orderBy: { sortOrder: "asc" } }),
		}),
		// The options a settled result can be stated from, winner first. Two
		// for a head-to-head, so the result reads as a scoreline ("64 to 52");
		// just the leader(s) for a leader pool, where the also-rans carry
		// numbers nothing displays; empty for every shape whose answer is one
		// number about the question as a whole (that's numericActualValue) or
		// no number at all. Separate from `options` above so a caller that
		// only wants the result doesn't pay for a whole award pool.
		scoredOptions: t.field({
			type: [QuestionOptionRef],
			resolve: async (question, _args, ctx) => {
				const scored = await scoredOptionsLoader(ctx).load(question.id)
				return match(question.shape)
					.returnType<typeof scored>()
					.with(
						"player_vs_player",
						"player_vs_player_season",
						"team_vs_team",
						"team_vs_team_season",
						() =>
							[...scored].sort(
								(a, b) => Number(b.isCorrect) - Number(a.isCorrect),
							),
					)
					.with("player_game_stat_leader", "player_season_stat_leader", () =>
						scored.filter((o) => o.isCorrect),
					)
					.otherwise(() => [])
			},
		}),
		callCount: t.relatedCount("calls"),
		// Every call's average conviction, summed: the whole field the
		// boldness tier measures each option's share against - see
		// crowdTotals.
		fieldConviction: t.float({
			resolve: (question, _args, ctx) =>
				questionFieldConvictionLoader(ctx).load(question.id),
		}),
		disputes: t.relation("disputes"),

		// The stat context cards for this question, or null when there's
		// nothing honest to show (see buildStatContext - a custom stat, a
		// season-scoped shape, a leader pool, or a subject with no stored
		// history all land there).
		//
		// A plain field, not t.loadable: the subject can be a player or a team,
		// with or without an opponent, so there's no single key to batch on and
		// a loader would issue the same queries anyway.
		//
		// Expensive by nature. Do NOT select this on a feed - it runs several
		// queries per question. The detail page fetches it in its own document,
		// separate from questionDetailQuery, so a slow card set can't hold up
		// the pick form.
		statContext: t.field({
			type: StatContextRef,
			nullable: true,
			resolve: async (question) => {
				if (!question.gameId) return null

				const [game, stat, league, options] = await Promise.all([
					db.query.games.findFirst({
						where: { id: question.gameId },
						columns: {
							id: true,
							homeTeamId: true,
							awayTeamId: true,
							startsAt: true,
						},
					}),
					question.statId
						? db.query.stats.findFirst({
								where: { id: question.statId },
								columns: { name: true },
							})
						: null,
					db.query.leagues.findFirst({
						where: { id: question.leagueId },
						columns: { slug: true },
					}),
					db.query.questionOptions.findMany({
						where: { questionId: question.id },
						orderBy: { sortOrder: "asc" },
						columns: { label: true, playerId: true, teamId: true },
					}),
				])
				if (!game || !league) return null

				// currentTeamId is "who they play for now", which is the only
				// team pointer a player carries - see players.ts. For a question
				// on an upcoming or recent game that's right; for an old game
				// after a trade it can be wrong, and a subject that resolves to
				// neither competitor gets no cards rather than the wrong ones.
				const playerIds = [
					question.subjectPlayerId,
					...options.map((o) => o.playerId),
				].filter((id): id is string => id !== null)

				const teamIds = [
					question.subjectTeamId,
					...options.map((o) => o.teamId),
					// The two competitors themselves. A matchup falls back to these
					// when the options name neither team - a game total's options are
					// Over and Under - and a column with no name on it is worse than
					// no column.
					game.homeTeamId,
					game.awayTeamId,
				].filter((id): id is string => id !== null)

				const [players, subjectTeams] = await Promise.all([
					playerIds.length
						? db.query.players.findMany({
								where: { id: { in: playerIds } },
								columns: {
									id: true,
									name: true,
									currentTeamId: true,
									positions: true,
								},
							})
						: [],
					teamIds.length
						? db.query.teams.findMany({
								where: { id: { in: teamIds } },
								columns: { id: true, name: true },
							})
						: [],
				])
				const playerById = new Map(players.map((p) => [p.id, p]))
				const teamById = new Map(subjectTeams.map((t) => [t.id, t]))

				// The label names the SIDE, not the stat - it's what a
				// head-to-head puts above each column. An option's own label is
				// already the player's name; the single-subject case has to look
				// it up.
				const refFor = (
					label: string,
					playerId: string | null,
					teamId: string | null,
				) => {
					const player = playerId ? playerById.get(playerId) : null
					const teamInGame =
						teamId ??
						(player?.currentTeamId === game.homeTeamId ||
						player?.currentTeamId === game.awayTeamId
							? player.currentTeamId
							: null)
					return {
						// A team question's subject has no player to name it,
						// so the team's own name is the label there.
						label:
							label ||
							player?.name ||
							(teamId ? (teamById.get(teamId)?.name ?? "") : ""),
						playerId,
						teamId,
						positions: player?.positions ?? [],
						teamInGameId: teamInGame,
					}
				}

				return buildStatContext({
					shape: question.shape,
					leagueSlug: league.slug,
					statName: stat?.name ?? null,
					customStat: question.customStat,
					statAggregation: question.statAggregation,
					ouLine: question.ouLine,
					locksAt: question.locksAt,
					seasonId: question.seasonId,
					game,
					subject:
						question.subjectPlayerId || question.subjectTeamId
							? refFor("", question.subjectPlayerId, question.subjectTeamId)
							: null,
					optionSubjects: options
						.filter((o) => o.playerId || o.teamId)
						.map((o) => refFor(o.label, o.playerId, o.teamId)),
					competitors: [
						refFor("", null, game.homeTeamId),
						refFor("", null, game.awayTeamId),
					],
				})
			},
		}),

		// True once any dispute on this question has been closed (upheld or
		// overturned) - fileDispute refuses to reopen the dispute process past
		// that point, so this also gates whether "Dispute this resolution" shows.
		hasSettledDispute: t.loadable({
			type: "Boolean",
			load: async (questionIds: string[]) => {
				const settled = await db.query.resolutionDisputes.findMany({
					where: {
						questionId: { in: questionIds },
						status: { in: ["upheld", "overturned"] },
					},
					columns: { questionId: true },
				})
				const settledIds = new Set(settled.map((d) => d.questionId))
				return questionIds.map((id) => settledIds.has(id))
			},
			resolve: (question) => question.id,
		}),

		// Every caller's pick on this question, newest first - the detail page's
		// activity list. Same keyset-cursor shape as myCalls.
		calls: t.field({
			type: CallConnectionRef,
			args: { first: t.arg.int(), after: t.arg.string() },
			resolve: (question, args) =>
				keysetPaginate(args, ({ where, ...page }) =>
					db.query.calls.findMany({
						where: { questionId: question.id, ...where },
						...page,
					}),
				),
		}),

		// Binned guess values for the guess-distribution chart - the
		// numeric-guess shapes only (NUMERIC_GUESS_SHAPES), empty for every
		// other shape. Bin width matches the question's own tolerance band
		// (numericToleranceAbsolute when the stat is a rate stat, else a flat
		// 1) - a guess within one tolerance band of another is "close enough"
		// to group together, which generalizes correctly whether the band is a
		// whole-number counting-stat amount or a small fixed rate-stat amount
		// like +/-0.02. Rounded to 3 decimal places (matching guessValue's own
		// column scale) to avoid floating-point bucket-key drift. Same
		// "aggregate bypasses the per-caller pick-visibility gate" precedent
		// averageGuess/numericHitRatePct already establish - individual bucket
		// counts aren't attributed to any one caller.
		guessDistribution: t.field({
			type: [GuessBucketRef],
			resolve: async (question, _args, ctx) => {
				if (!isNumericGuessShape(question.shape)) return []
				const guessCalls = await questionGuessCallsLoader(ctx).load(question.id)
				const bucketWidth = question.numericToleranceAbsolute ?? 1
				const counts = new Map<number, number>()
				for (const call of guessCalls) {
					if (call.guessValue === null) continue
					const bucket =
						Math.round(
							Math.round(call.guessValue / bucketWidth) * bucketWidth * 1000,
						) / 1000
					counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
				}
				return [...counts.entries()]
					.sort((a, b) => a[0] - b[0])
					.map(([value, count]) => ({ value, count }))
			},
		}),

		// Dataloader-backed rather than a plain findFirst per question - a list
		// of N questions (the home feed, my-calls, group tabs, ...) used to
		// fire N separate queries for this one field alone. Invisible when
		// signed out (ctx.user null short-circuits before any query), which is
		// exactly why it went unnoticed - every anonymous/dev-scale test of
		// these lists looked fine. load() batches the whole page's questionIds
		// into a single `IN (...)` query per request.
		// How regularly the viewer plays this question's league, on a
		// season-long question: what a call made now is worth at their pace so
		// far - see SeasonPlay. Null signed out, and on any other question.
		viewerSeasonPlay: t.field({
			type: SeasonPlayRef,
			nullable: true,
			resolve: (question, _args, ctx) =>
				ctx.user ? paceFor(ctx, question, ctx.user.id) : null,
		}),
		// What a call made now on a series question is worth, for how far
		// into the series it is - see SeriesStage. Null on any other question.
		seriesStage: t.field({
			type: SeriesStageRef,
			nullable: true,
			resolve: (question, _args, ctx) => questionSeriesStage(ctx, question),
		}),
		viewerCall: t.loadable({
			type: CallRef,
			nullable: true,
			load: async (questionIds: string[], ctx) => {
				if (!ctx.user) return questionIds.map(() => null)
				const found = await db.query.calls.findMany({
					where: {
						questionId: { in: questionIds },
						userId: ctx.user.id,
					},
				})
				return indexByKey(questionIds, found, (c) => c.questionId, null)
			},
			resolve: (question) => question.id,
		}),

		// Where the question stands while its game is being played, from the
		// latest in-progress box score (see db/sync/sync-live-readings.ts).
		// Null before the game, on a shape the box score can't speak to, and
		// once the question settles, when its own result takes over.
		liveReading: t.loadable({
			type: LiveReadingRef,
			nullable: true,
			load: async (questionIds: string[]) => {
				const found = await db.query.questionLiveReadings.findMany({
					where: { questionId: { in: questionIds } },
				})
				return indexByKey(questionIds, found, (r) => r.questionId, null)
			},
			resolve: (question) =>
				question.status === "open" || question.status === "locked"
					? question.id
					: null,
		}),

		// One line of recent form for the question's card on a game page - see
		// lib/card-fact. Batched across the page, unlike statContext, which is
		// why a list can select it. Only while the question can still be
		// called: a locked card has its live reading, and the 60s refetch of
		// a game in play never reaches the loader.
		cardFact: t.loadable({
			type: CardFactRef,
			nullable: true,
			load: (questionIds: string[]) => loadCardFacts(questionIds),
			resolve: (question) =>
				question.status === "open" && question.locksAt > new Date()
					? question.id
					: null,
		}),

		// Which side the people in the viewer's groups took, per option - see
		// lib/group-picks. Empty signed out or when no group-mate has called it.
		viewerGroupPicks: t.loadableList({
			type: GroupPickTallyRef,
			load: (questionIds: string[], ctx) =>
				loadViewerGroupPicks(questionIds, ctx),
			resolve: (question) => question.id,
		}),

		// The viewer's run in this question's league and family, when this
		// question counts toward it and the run is at least STREAK_TAG_MIN -
		// what the pick form shows as being on the line.
		viewerStreak: t.field({
			type: StreakStakeRef,
			nullable: true,
			resolve: async (question, _args, ctx) => {
				const family = streakFamilyFor(question.shape)
				if (!ctx.user || !family || !countsTowardAchievements(question)) {
					return null
				}
				const streak = await viewerStreakLoader(ctx).load(
					`${ctx.user.id}:${question.leagueId}:${family}`,
				)
				return streak && streak.currentLength >= STREAK_TAG_MIN ? streak : null
			},
		}),

		// How the viewer has done picking each of this question's two options
		// on every other question of the same shape and stat they've settled:
		// overall, on this subject alone, and home against road when the
		// options are the game's two teams. Null when signed out, when the
		// question doesn't have exactly two options, or when no row has a side
		// with enough calls.
		viewerTrackRecord: t.field({
			type: TrackRecordRef,
			nullable: true,
			resolve: async (question, _args, ctx) => {
				if (!ctx.user) return null
				const [stat, team, player] = await Promise.all([
					question.statId
						? db.query.stats.findFirst({
								where: { id: question.statId },
								columns: { name: true },
							})
						: null,
					question.subjectTeamId
						? db.query.teams.findFirst({
								where: { id: question.subjectTeamId },
								columns: { name: true },
							})
						: null,
					question.subjectPlayerId
						? db.query.players.findFirst({
								where: { id: question.subjectPlayerId },
								columns: { name: true },
							})
						: null,
				])
				const rows = await loadTrackRecord(
					ctx.user.id,
					question,
					player?.name ?? team?.name ?? null,
				)
				if (!rows || rows.length === 0) return null
				return { label: stat?.name ?? SHAPE_LABEL[question.shape], rows }
			},
		}),

		viewerDispute: t.loadable({
			type: ResolutionDisputeRef,
			nullable: true,
			load: async (questionIds: string[], ctx) => {
				if (!ctx.user) return questionIds.map(() => null)
				const found = await db.query.resolutionDisputes.findMany({
					where: {
						questionId: { in: questionIds },
						userId: ctx.user.id,
						status: "open",
					},
				})
				return indexByKey(questionIds, found, (d) => d.questionId, null)
			},
			resolve: (question) => question.id,
		}),
		viewerReport: t.loadable({
			type: QuestionReportRef,
			nullable: true,
			load: async (questionIds: string[], ctx) => {
				if (!ctx.user) return questionIds.map(() => null)
				const found = await db.query.questionReports.findMany({
					where: {
						questionId: { in: questionIds },
						reportedByUserId: ctx.user.id,
					},
				})
				return indexByKey(questionIds, found, (r) => r.questionId, null)
			},
			resolve: (question) => question.id,
		}),

		// Which of the viewer's OWN groups already have this question in their
		// Shared tab - drives the "Shared" state per row in the share sheet.
		// Scoped through groupMembers on purpose: a share row exists per
		// group regardless of who created it, and leaking the ids of groups
		// the viewer isn't in would say something about groups they can't see.
		// Empty (not null) when signed out, so the frontend never branches.
		viewerSharedGroupIds: t.loadableList({
			type: "ID",
			load: async (questionIds: string[], ctx) => {
				if (!ctx.user) return questionIds.map(() => [])
				const rows = await db
					.select({
						questionId: questionShares.questionId,
						groupId: questionShares.groupId,
					})
					.from(questionShares)
					.innerJoin(
						groupMembers,
						and(
							eq(groupMembers.groupId, questionShares.groupId),
							eq(groupMembers.userId, ctx.user.id),
						),
					)
					.where(inArray(questionShares.questionId, questionIds))
				return groupByKey(questionIds, rows, (row) => row.questionId).map(
					(shares) => shares.map((share) => share.groupId),
				)
			},
			resolve: (question) => question.id,
		}),

		// Batched by questionId, same pattern as viewerCall above - a feed page
		// of N questions fires one IN (...) query for this field, not N. Only
		// surfaces a membership row when its ballot is actually published - a
		// draft ballot's members render as fully standalone questions, same as
		// if they weren't in any ballot at all.
		ballotMembership: t.loadable({
			type: BallotQuestionRef,
			nullable: true,
			load: async (questionIds: string[]) => {
				const found = await db.query.ballotQuestions.findMany({
					where: { questionId: { in: questionIds } },
					with: { ballot: true },
				})
				return indexByKey(
					questionIds,
					found.filter((row) => row.ballot?.status === "published"),
					(row) => row.questionId,
					null,
				)
			},
			resolve: (question) => question.id,
		}),
	}),
})
