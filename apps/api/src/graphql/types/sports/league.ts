import { and, count, eq, min, notInArray } from "drizzle-orm"
import { db } from "../../../db"
import { LEAGUE_SEASON_FORMAT } from "../../../db/catalog/league-season-format"
import { calls, games, type League, questions } from "../../../db/schema"
import { getCurrentSeason, listLeagueSeasons } from "../../../lib/seasons"
import { getLeagueWindows } from "../../../lib/windows"
import { builder } from "../../builder"
import { type Context, ctxCache } from "../../context"
import { LeagueStatus, LeagueWindowType } from "./enums"

// Every league, read at most once per request. The table holds a handful of
// rows, so one unfiltered read serves every by-id or by-slug lookup a page
// makes (a streak list's league tags, a notification feed, a permalink's slug).
export async function findLeague(
	ctx: Context,
	by: { id: string } | { slug: string },
): Promise<League | null> {
	const leagues = await ctxCache(ctx, "leagues", async () => {
		const rows = await db.query.leagues.findMany()
		return {
			byId: new Map(rows.map((league) => [league.id, league])),
			bySlug: new Map(rows.map((league) => [league.slug, league])),
		}
	})
	return (
		("id" in by ? leagues.byId.get(by.id) : leagues.bySlug.get(by.slug)) ?? null
	)
}

export const SportRef = builder.drizzleObject("sports", {
	name: "Sport",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		slug: t.exposeString("slug"),
		leagues: t.relation("leagues"),
	}),
})

// Static reference data (db/catalog/league-season-format.ts), not a synced
// column - exposed on League so the win-total guess input can bound/default
// itself (min 0, max gamesPerSeason) without duplicating this table on the
// frontend.
const LeagueSeasonFormatRef = builder
	.objectRef<{ gamesPerSeason: number }>("LeagueSeasonFormat")
	.implement({
		fields: (t) => ({
			gamesPerSeason: t.exposeInt("gamesPerSeason"),
		}),
	})

export const LeagueRef = builder.drizzleObject("leagues", {
	name: "League",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		abbreviation: t.exposeString("abbreviation"),
		slug: t.exposeString("slug"),
		status: t.field({ type: LeagueStatus, resolve: (l) => l.status }),
		windowType: t.field({
			type: LeagueWindowType,
			resolve: (l) => l.windowType,
		}),
		// Null for a league with nothing in LEAGUE_SEASON_FORMAT yet - not every
		// league is guaranteed an entry the moment it's added to SYNCED_LEAGUES.
		seasonFormat: t.field({
			type: LeagueSeasonFormatRef,
			nullable: true,
			resolve: (l) => LEAGUE_SEASON_FORMAT[l.slug] ?? null,
		}),
		sport: t.relation("sport"),
		teams: t.relation("teams"),
		// Same data as the currentSeason/leagueSeasons root queries, exposed on
		// the row so a caller already listing leagues (the app shell's league
		// rail, which every page reads from router context) gets each league's
		// season vocabulary in the same round trip rather than a query per
		// league. startedOnly is what a season picker wants - see
		// lib/seasons.ts's listLeagueSeasons.
		currentSeason: t.field({
			type: SeasonRef,
			nullable: true,
			resolve: (league) => getCurrentSeason(league.id),
		}),
		seasons: t.field({
			type: [SeasonRef],
			args: { startedOnly: t.arg.boolean({ required: false }) },
			resolve: (league, args) =>
				listLeagueSeasons(league.id, { startedOnly: !!args.startedOnly }),
		}),
		// Home's room cards below - a plain per-row resolve rather than a
		// batched loadable, since there are only ever a handful of leagues on
		// one page (no N+1 risk worth guarding against here).
		// Games in the window this league is currently inside - a day for a
		// date-window league, a week for a week-window one (see
		// leagues.windowType). Read off the same getLeagueWindows the Games
		// tab steps through rather than counting a calendar day directly, so
		// the room header and the stepper below it can never describe the same
		// league by two different units. 0 between windows (an NFL Tuesday, a
		// dark night in an MLB week), where no window contains now at all.
		currentWindowGameCount: t.field({
			type: "Int",
			resolve: async (league) => {
				const now = new Date()
				const windows = await getLeagueWindows(league)
				const current = windows.find(
					(w) => w.rangeStart <= now && now <= w.rangeEnd,
				)
				return current?.gameCount ?? 0
			},
		}),
		liveGameCount: t.field({
			type: "Int",
			resolve: async (league) => {
				const [{ n }] = await db
					.select({ n: count() })
					.from(games)
					.where(and(eq(games.leagueId, league.id), eq(games.status, "live")))
				return n
			},
		}),
		// Soonest lock among this league's still-open questions - null once
		// nothing's open (offseason, or between the day's games and tomorrow's).
		nextLockAt: t.field({
			type: "DateTime",
			nullable: true,
			resolve: async (league) => {
				const [row] = await db
					.select({ locksAt: min(questions.locksAt) })
					.from(questions)
					.where(
						and(
							eq(questions.leagueId, league.id),
							eq(questions.status, "open"),
						),
					)
				return row?.locksAt ? new Date(row.locksAt) : null
			},
		}),
		// Null when signed out - Home (the only caller) is authed-only, but this
		// field itself doesn't assume that. Calls, not uncalled questions: this
		// is "how much of what you've already picked in this league is still
		// live," not "how much is left to call."
		myOpenCallCount: t.field({
			type: "Int",
			nullable: true,
			resolve: async (league, _args, ctx) => {
				if (!ctx.user) return null
				const [{ n }] = await db
					.select({ n: count() })
					.from(calls)
					.innerJoin(questions, eq(questions.id, calls.questionId))
					.where(
						and(
							eq(calls.userId, ctx.user.id),
							eq(questions.leagueId, league.id),
							notInArray(questions.status, ["resolved", "voided"]),
						),
					)
				return n
			},
		}),
	}),
})

export const SeasonRef = builder.drizzleObject("seasons", {
	name: "Season",
	fields: (t) => ({
		id: t.exposeID("id"),
		year: t.exposeInt("year"),
		displayName: t.exposeString("displayName"),
		regularSeasonStartsAt: t.field({
			type: "DateTime",
			resolve: (s) => s.regularSeasonStartsAt,
		}),
		regularSeasonEndsAt: t.field({
			type: "DateTime",
			resolve: (s) => s.regularSeasonEndsAt,
		}),
		postseasonStartsAt: t.field({
			type: "DateTime",
			nullable: true,
			resolve: (s) => s.postseasonStartsAt,
		}),
		postseasonEndsAt: t.field({
			type: "DateTime",
			nullable: true,
			resolve: (s) => s.postseasonEndsAt,
		}),
		league: t.relation("league"),
	}),
})
