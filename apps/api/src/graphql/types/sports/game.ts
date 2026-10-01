import { and, count, eq } from "drizzle-orm"
import { DateTime } from "luxon"
import { db } from "../../../db"
import { calls, questions, type User } from "../../../db/schema"
import {
	type GameEntry,
	type GameEntryVerdict as GameEntryVerdictValue,
	gameEntryVerdict,
	loadGameEntry,
} from "../../../lib/game-entry"
import { hasGameReminder } from "../../../lib/game-reminders"
import { buildWeekWindowKey, ET_ZONE } from "../../../lib/windows"
import { builder } from "../../builder"
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

const GameEntryRef = builder
	.objectRef<GameEntry & { user: User; verdict: GameEntryVerdictValue | null }>(
		"GameEntry",
	)
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
		// Whether the viewer asked to be reminded before this game starts - see
		// lib/game-reminders.tsx. False when signed out.
		viewerHasReminder: t.field({
			type: "Boolean",
			resolve: async (game, _args, ctx) =>
				ctx.user ? hasGameReminder(ctx.user.id, game.id) : false,
		}),
		// Null when signed out - same reasoning as League.myOpenCallCount.
		// A plain per-row resolve: a games list is one window's worth of games
		// (a day or a week), never large enough to worry about N+1.
		viewerCalledCount: t.field({
			type: "Int",
			nullable: true,
			resolve: async (game, _args, ctx) => {
				if (!ctx.user) return null
				const [{ n }] = await db
					.select({ n: count() })
					.from(calls)
					.innerJoin(questions, eq(questions.id, calls.questionId))
					.where(
						and(eq(calls.userId, ctx.user.id), eq(questions.gameId, game.id)),
					)
				return n
			},
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
					user,
					verdict: gameEntryVerdict(entry.official, game.status),
				}
			},
		}),
	}),
})
