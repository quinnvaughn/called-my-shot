import { and, count, eq } from "drizzle-orm"
import { DateTime } from "luxon"
import { db } from "../../../db"
import { calls, questions } from "../../../db/schema"
import { builder } from "../../builder"
import { GameStatus } from "./enums"
import { loadTeamRecordsByKey, TeamRecordRef } from "./team"
import { ET_ZONE } from "./windows"

export const GameRef = builder.drizzleObject("games", {
	name: "Game",
	fields: (t) => ({
		id: t.exposeID("id"),
		startsAt: t.field({
			type: "String",
			resolve: (g) => g.startsAt.toISOString(),
		}),
		status: t.field({ type: GameStatus, resolve: (g) => g.status }),
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
				const league = await db.query.leagues.findFirst({
					where: { id: game.leagueId },
					columns: { windowType: true },
				})
				if (league?.windowType === "week") {
					return `${game.seasonId}:${game.seasonType}:${game.weekNumber}`
				}
				return DateTime.fromJSDate(game.startsAt, { zone: ET_ZONE }).toFormat(
					"yyyy-LL-dd",
				)
			},
		}),
		// Plain per-row resolves, not batched loadables - a games list is one
		// window's worth of games (a day or a week), never large enough to worry
		// about N+1 the way a long feed would.
		questionCount: t.field({
			type: "Int",
			resolve: async (game) => {
				const [{ n }] = await db
					.select({ n: count() })
					.from(questions)
					.where(eq(questions.gameId, game.id))
				return n
			},
		}),
		// Null when signed out - same reasoning as League.myOpenCallCount above.
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
	}),
})
