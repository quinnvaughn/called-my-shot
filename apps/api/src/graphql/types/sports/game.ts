import { and, count, eq, gt } from "drizzle-orm"
import { DateTime } from "luxon"
import { db } from "../../../db"
import { questions, type User } from "../../../db/schema"
import {
	type GroupCallers,
	loadCallerCounts,
	loadGroupCallers,
	loadUserCalledCounts,
} from "../../../lib/game-callers"
import {
	type GameEntry,
	type GameEntryVerdict as GameEntryVerdictValue,
	gameEntryVerdict,
	loadCalledCommunityQuestions,
	loadGameEntry,
} from "../../../lib/game-entry"
import { hasGameReminder } from "../../../lib/game-reminders"
import { buildWeekWindowKey, ET_ZONE } from "../../../lib/windows"
import { builder } from "../../builder"
import { ctxLoader } from "../../loader"
import { CallRef } from "../question/call"
import { QuestionRef } from "../question/question-object"
import { UserRef } from "../user"
import { GameEntryVerdict, GameStatus } from "./enums"
import { GamePostseasonRef, loadGamePostseason } from "./postseason"
import { loadTeamRecordsByKey, TeamRecordRef } from "./team"

// One question of someone's picks on a game, and their call on it.
const GameEntryMemberRef = builder
	.objectRef<GameEntry["official"]["members"][number]>("GameEntryMember")
	.implement({
		fields: (t) => ({
			question: t.field({ type: QuestionRef, resolve: (m) => m.member }),
			call: t.field({ type: CallRef, nullable: true, resolve: (m) => m.call }),
		}),
	})

// One half of a game entry's record - see GameEntry in lib/game-entry.ts.
const GameEntrySplitRef = builder
	.objectRef<GameEntry["official"]>("GameEntrySplit")
	.implement({
		fields: (t) => ({
			calledCount: t.exposeInt("calledCount"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			points: t.exposeInt("points"),
		}),
	})

export const GameEntryRef = builder
	.objectRef<
		GameEntry & {
			gameId: string
			user: User
			verdict: GameEntryVerdictValue | null
		}
	>("GameEntry")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (e) => e.user }),
			// Official questions called, against members' length: how much of
			// the slate everyone gets is done.
			calledCount: t.int({ resolve: (e) => e.official.calledCount }),
			// Record and points across every call on the game, official and
			// community both. official and community below split them.
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			points: t.exposeInt("points"),
			official: t.field({
				type: GameEntrySplitRef,
				resolve: (e) => e.official,
			}),
			community: t.field({
				type: GameEntrySplitRef,
				resolve: (e) => e.community,
			}),
			// Decided by the official questions alone.
			verdict: t.field({
				type: GameEntryVerdict,
				nullable: true,
				resolve: (e) => e.verdict,
			}),
			// Every official question, called or not.
			members: t.field({
				type: [GameEntryMemberRef],
				resolve: (e) => e.official.members,
			}),
			// Only the community questions this user called.
			communityMembers: t.field({
				type: [GameEntryMemberRef],
				resolve: (e) => e.community.members,
			}),
		}),
	})

// The per-game counts below are keyed by game id alone, so every row on a
// games list goes out as one query each. The viewer is fixed for the request.
const callerCountLoader = ctxLoader(async (gameIds: string[]) => {
	const counts = await loadCallerCounts(gameIds)
	return gameIds.map((id) => counts.get(id) ?? 0)
})

const viewerCalledCountLoader = ctxLoader(
	async (gameIds: string[], ctx): Promise<number[]> => {
		if (!ctx.user) return gameIds.map(() => 0)
		const counts = await loadUserCalledCounts(ctx.user.id, gameIds)
		return gameIds.map((id) => counts.get(id) ?? 0)
	},
)

const NO_GROUP_CALLERS: GroupCallers = { count: 0, preview: [] }

const viewerGroupCallersLoader = ctxLoader(
	async (gameIds: string[], ctx): Promise<GroupCallers[]> => {
		if (!ctx.user) return gameIds.map(() => NO_GROUP_CALLERS)
		const byGame = await loadGroupCallers(ctx.user.id, gameIds)
		return gameIds.map((id) => byGame.get(id) ?? NO_GROUP_CALLERS)
	},
)

const GameGroupCallersRef = builder
	.objectRef<GroupCallers>("GameGroupCallers")
	.implement({
		fields: (t) => ({
			count: t.exposeInt("count"),
			// The most recent few callers, never more than
			// GROUP_CALLER_PREVIEW.
			preview: t.field({ type: [UserRef], resolve: (c) => c.preview }),
		}),
	})

export const GameRef = builder.drizzleObject("games", {
	name: "Game",
	fields: (t) => ({
		id: t.exposeID("id"),
		startsAt: t.field({
			type: "DateTime",
			resolve: (g) => g.startsAt,
		}),
		status: t.field({ type: GameStatus, resolve: (g) => g.status }),
		// Only ever true while status is LIVE - see games.atHalftime.
		atHalftime: t.exposeBoolean("atHalftime"),
		// ESPN's one-line read of where a live game is ("Top 7th", "6:11 -
		// 4th"). Null before it starts; where it ended once it's final.
		statusDetail: t.exposeString("statusDetail", { nullable: true }),
		// startsAt is a placeholder date with no real time yet - see
		// games.startTimeTbd.
		startTimeTbd: t.exposeBoolean("startTimeTbd"),
		// Null for a regular-season game.
		postseason: t.field({
			type: GamePostseasonRef,
			nullable: true,
			resolve: (game, _args, ctx) => loadGamePostseason(game, ctx),
		}),
		homeScore: t.exposeInt("homeScore", { nullable: true }),
		awayScore: t.exposeInt("awayScore", { nullable: true }),
		// The specific game's location, not necessarily the home team's usual
		// park - see games.venue in db/schema/games.ts. Null for a game synced
		// before this column existed, until its next sync pass.
		venue: t.exposeString("venue", { nullable: true }),
		league: t.relation("league"),
		homeTeam: t.relation("homeTeam"),
		awayTeam: t.relation("awayTeam"),
		// Both teams' starters, kept current by db/sync/sync-game-starters.ts.
		// Empty for a game outside that job's window. Ordered by sortOrder,
		// which is batting order or depth chart order within each team and
		// role.
		starters: t.relation("starters", {
			query: () => ({ orderBy: { sortOrder: "asc" } }),
		}),
		// Batched by "teamId|seasonId" rather than by game id directly - two
		// games between the same teams in the same season (a rematch) would
		// otherwise issue two identical lookups instead of sharing one, and the
		// dataloader cache key needs to be a single primitive, not the pair
		// t.loadable would otherwise want to pass through untouched.
		homeTeamRecord: t.loadable({
			type: TeamRecordRef,
			nullable: true,
			load: loadTeamRecordsByKey,
			resolve: (game) => `${game.homeTeamId}|${game.seasonId}`,
		}),
		awayTeamRecord: t.loadable({
			type: TeamRecordRef,
			nullable: true,
			load: loadTeamRecordsByKey,
			resolve: (game) => `${game.awayTeamId}|${game.seasonId}`,
		}),
		// The Games tab window (a date, or a season/seasonType/week for a
		// week-window league) this specific game falls in - same key format
		// getLeagueWindows computes in bulk for that tab, re-derived here for
		// one game so a "back to Games" link can jump straight to the window
		// this game is actually in instead of always landing on
		// today/this week. Plain per-row resolve, not batched - only ever
		// queried for the one game a game detail page loads.
		windowKey: t.field({
			type: "String",
			resolve: async (game) => {
				const [league, season] = await Promise.all([
					db.query.leagues.findFirst({
						where: { id: game.leagueId },
						columns: { windowType: true },
					}),
					db.query.seasons.findFirst({
						where: { id: game.seasonId },
						columns: { year: true },
					}),
				])
				// Built through the shared helper rather than by hand. The string
				// this returns has to match getLeagueWindows' key exactly or the
				// link fails silently: a key that matches no window falls through
				// to pickDefaultWindowIndex and lands on today/this week, with
				// nothing anywhere reporting that it missed.
				if (
					league?.windowType === "week" &&
					season &&
					game.weekNumber !== null
				) {
					return buildWeekWindowKey(
						season.year,
						game.seasonType,
						game.weekNumber,
					)
				}
				return DateTime.fromJSDate(game.startsAt, { zone: ET_ZONE }).toFormat(
					"yyyy-LL-dd",
				)
			},
		}),
		questionCount: t.relatedCount("questions"),
		// The game's official questions, oldest first. Community questions are
		// left out: a game can collect any number of them. No literal `with` here,
		// for the same reason as BallotRef.members (graphql/types/ballot/refs.ts).
		officialQuestions: t.relation("questions", {
			query: () => ({
				where: { isOfficial: true },
				orderBy: { createdAt: "asc", id: "asc" },
			}),
		}),
		// Community questions on this game that can still be called, for the
		// game page's Community tab label - same rule as
		// League.openCommunityQuestionCount, so the badge only ever means
		// something is left to call. The tab's list still shows the locked and
		// settled ones.
		openCommunityQuestionCount: t.field({
			type: "Int",
			resolve: async (game) => {
				const [{ n }] = await db
					.select({ n: count() })
					.from(questions)
					.where(
						and(
							eq(questions.gameId, game.id),
							eq(questions.isOfficial, false),
							eq(questions.status, "open"),
							gt(questions.locksAt, new Date()),
						),
					)
				return n
			},
		}),
		// The community questions on this game the viewer called, oldest
		// first, for the game rail's Community tab. Empty when signed out.
		viewerCommunityQuestions: t.field({
			type: [QuestionRef],
			resolve: (game, _args, ctx) =>
				ctx.user ? loadCalledCommunityQuestions(game.id, ctx.user.id) : [],
		}),
		// Whether the viewer asked to be reminded before this game starts - see
		// lib/game-reminders.tsx. False when signed out.
		viewerHasReminder: t.field({
			type: "Boolean",
			resolve: async (game, _args, ctx) =>
				ctx.user ? hasGameReminder(ctx.user.id, game.id) : false,
		}),
		// Null when signed out - same reasoning as League.myOpenCallCount.
		viewerCalledCount: t.field({
			type: "Int",
			nullable: true,
			resolve: (game, _args, ctx) =>
				ctx.user ? viewerCalledCountLoader(ctx).load(game.id) : null,
		}),
		// Everyone with a call on this game, the viewer included.
		callerCount: t.field({
			type: "Int",
			resolve: (game, _args, ctx) => callerCountLoader(ctx).load(game.id),
		}),
		// People in the viewer's groups who called this game, the viewer left
		// out. Empty when signed out.
		viewerGroupCallers: t.field({
			type: GameGroupCallersRef,
			resolve: (game, _args, ctx) =>
				viewerGroupCallersLoader(ctx).load(game.id),
		}),
		// One user's calls on this game, behind /games/:id/picks/:username.
		// Null for an unknown user or one with no calls here.
		entry: t.field({
			type: GameEntryRef,
			nullable: true,
			args: { username: t.arg.string({ required: true }) },
			resolve: async (game, args) => {
				const user = await db.query.users.findFirst({
					where: { username: args.username },
				})
				if (!user) return null
				const entry = await loadGameEntry(game.id, user.id)
				if (!entry) return null
				return {
					...entry,
					gameId: game.id,
					user,
					verdict: gameEntryVerdict(entry.official, game.status),
				}
			},
		}),
	}),
})
