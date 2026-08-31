import {
	createGameSchema,
	createLeagueSchema,
	createPlayerSchema,
	createTeamSchema,
	updateGameSchema,
	updateLeagueSchema,
	updatePlayerSchema,
	updateTeamSchema,
} from "@called-my-shot/schemas"
import {
	and,
	asc,
	count,
	eq,
	getColumns,
	gte,
	lt,
	min,
	ne,
	sql,
} from "drizzle-orm"
import { DateTime } from "luxon"
import { db } from "../../db"
import type { Game, League, Player, Team } from "../../db/schema"
import {
	calls,
	games,
	leagues,
	players,
	questions,
	teams,
} from "../../db/schema"
import { NFL_SLOT_LABELS, NFL_SLOT_ORDER } from "../../db/sync/nfl-slot"
import {
	type AdminConnection,
	buildAdminConnection,
	clampAdminPageSize,
	SortDirection,
	sortColumn,
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
import { builder } from "../builder"
import { PageInfoRef } from "./pagination"

const LeagueStatus = builder.enumType("LeagueStatus", {
	values: {
		ACTIVE: { value: "active" },
		INACTIVE: { value: "inactive" },
	},
})

const GameStatus = builder.enumType("GameStatus", {
	values: {
		SCHEDULED: { value: "scheduled" },
		LIVE: { value: "live" },
		FINAL: { value: "final" },
	},
})

// How a league's Games tab pages through its schedule - see
// leagues.windowType's comment in db/schema/sports.ts.
const LeagueWindowType = builder.enumType("LeagueWindowType", {
	values: {
		DATE: { value: "date" },
		WEEK: { value: "week" },
	},
})

const ToleranceMode = builder.enumType("ToleranceMode", {
	values: {
		PERCENTAGE: { value: "percentage" },
		ABSOLUTE: { value: "absolute" },
	},
})

const StatAppliesTo = builder.enumType("StatAppliesTo", {
	values: {
		PLAYER: { value: "player" },
		TEAM: { value: "team" },
		BOTH: { value: "both" },
	},
})

const AdminLeagueSort = builder.enumType("AdminLeagueSort", {
	values: { NAME: { value: "name" }, STATUS: { value: "status" } },
})
const AdminTeamSort = builder.enumType("AdminTeamSort", {
	values: { NAME: { value: "name" }, ABBREVIATION: { value: "abbreviation" } },
})
const AdminPlayerSort = builder.enumType("AdminPlayerSort", {
	values: { NAME: { value: "name" }, POSITION: { value: "position" } },
})
const AdminGameSort = builder.enumType("AdminGameSort", {
	values: { STARTS_AT: { value: "startsAt" }, STATUS: { value: "status" } },
})

export const SportRef = builder.drizzleObject("sports", {
	name: "Sport",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		slug: t.exposeString("slug"),
		leagues: t.relation("leagues"),
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
		sport: t.relation("sport"),
		teams: t.relation("teams"),
		// Home's room cards below - a plain per-row resolve rather than a
		// batched loadable, since there are only ever a handful of leagues on
		// one page (no N+1 risk worth guarding against here).
		gamesTodayCount: t.field({
			type: "Int",
			resolve: async (league) => {
				const now = DateTime.now()
				const [{ n }] = await db
					.select({ n: count() })
					.from(games)
					.where(
						and(
							eq(games.leagueId, league.id),
							gte(games.startsAt, now.startOf("day").toJSDate()),
							lt(games.startsAt, now.endOf("day").toJSDate()),
						),
					)
				return n
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
			type: "String",
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
				return row?.locksAt ? new Date(row.locksAt).toISOString() : null
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
							ne(questions.status, "resolved"),
						),
					)
				return n
			},
		}),
	}),
})

export const TeamRef = builder.drizzleObject("teams", {
	name: "Team",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		abbreviation: t.exposeString("abbreviation"),
		color: t.exposeString("color"),
		conference: t.exposeString("conference", { nullable: true }),
		division: t.exposeString("division", { nullable: true }),
		league: t.relation("league"),
	}),
})

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
		league: t.relation("league"),
		homeTeam: t.relation("homeTeam"),
		awayTeam: t.relation("awayTeam"),
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

export const SeasonRef = builder.drizzleObject("seasons", {
	name: "Season",
	fields: (t) => ({
		id: t.exposeID("id"),
		year: t.exposeInt("year"),
		displayName: t.exposeString("displayName"),
		regularSeasonStartsAt: t.field({
			type: "String",
			resolve: (s) => s.regularSeasonStartsAt.toISOString(),
		}),
		regularSeasonEndsAt: t.field({
			type: "String",
			resolve: (s) => s.regularSeasonEndsAt.toISOString(),
		}),
		postseasonStartsAt: t.field({
			type: "String",
			nullable: true,
			resolve: (s) => s.postseasonStartsAt?.toISOString() ?? null,
		}),
		postseasonEndsAt: t.field({
			type: "String",
			nullable: true,
			resolve: (s) => s.postseasonEndsAt?.toISOString() ?? null,
		}),
		league: t.relation("league"),
	}),
})

export const PlayerRef = builder.drizzleObject("players", {
	name: "Player",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		position: t.exposeString("position", { nullable: true }),
		// Every position this player is ESPN-eligible at, used for award-pool
		// eligibility (see questions.awardPositions) - distinct from `position`
		// above, which is just their single current/primary tag.
		positions: t.field({ type: ["String"], resolve: (p) => p.positions }),
		// null for free agents/retired players, not every player is on a team
		currentTeam: t.relation("currentTeam", { nullable: true }),
		seasonsInLeague: t.exposeInt("seasonsInLeague"),
		// Real rookie-of-the-year eligibility for the current season, per this
		// player's sport's own rule - see players.rookieEligible's comment in
		// db/schema/sports.ts for why this isn't just seasonsInLeague === 0.
		rookieEligible: t.exposeBoolean("rookieEligible"),
	}),
})

export const StatToleranceTierRef = builder.drizzleObject(
	"statToleranceTiers",
	{
		name: "StatToleranceTier",
		fields: (t) => ({
			id: t.exposeID("id"),
			name: t.exposeString("name"),
			toleranceMode: t.field({
				type: ToleranceMode,
				resolve: (tier) => tier.toleranceMode,
			}),
			toleranceValue: t.exposeFloat("toleranceValue"),
		}),
	},
)

export const StatRef = builder.drizzleObject("stats", {
	name: "Stat",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		category: t.exposeString("category"),
		sortOrder: t.exposeInt("sortOrder"),
		appliesTo: t.field({ type: StatAppliesTo, resolve: (s) => s.appliesTo }),
		sport: t.relation("sport"),
		toleranceTier: t.relation("toleranceTier"),
	}),
})

const AdminLeagueConnectionRef = builder
	.objectRef<AdminConnection<League>>("AdminLeagueConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [LeagueRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

const AdminTeamConnectionRef = builder
	.objectRef<AdminConnection<Team>>("AdminTeamConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [TeamRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

const AdminPlayerConnectionRef = builder
	.objectRef<AdminConnection<Player>>("AdminPlayerConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [PlayerRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

const AdminGameConnectionRef = builder
	.objectRef<AdminConnection<Game>>("AdminGameConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [GameRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

// One page of a league's Games tab, in the shape the league's own windowType
// dictates - a single day (MLB/NBA) or a single week (NFL). Bounded to what's
// actually synced (see getLeagueWindows below), never an infinite-future
// list.
type WindowDescriptor = {
	key: string
	label: string
	sublabel: string | null
	gameCount: number
	rangeStart: Date
	rangeEnd: Date
}

const GameWindowRef = builder
	.objectRef<WindowDescriptor>("GameWindow")
	.implement({
		fields: (t) => ({
			key: t.exposeString("key"),
			label: t.exposeString("label"),
			sublabel: t.exposeString("sublabel", { nullable: true }),
			gameCount: t.exposeInt("gameCount"),
		}),
	})

type SlotGroup = { slotLabel: string | null; games: Game[] }

const GameSlotGroupRef = builder
	.objectRef<SlotGroup>("GameSlotGroup")
	.implement({
		fields: (t) => ({
			slotLabel: t.exposeString("slotLabel", { nullable: true }),
			games: t.field({ type: [GameRef], resolve: (g) => g.games }),
		}),
	})

type LeagueGamesForWindowResult = {
	window: WindowDescriptor
	prevKey: string | null
	nextKey: string | null
	groups: SlotGroup[]
}

const LeagueGamesForWindowResultRef = builder
	.objectRef<LeagueGamesForWindowResult>("LeagueGamesForWindowResult")
	.implement({
		fields: (t) => ({
			window: t.field({ type: GameWindowRef, resolve: (r) => r.window }),
			prevKey: t.exposeString("prevKey", { nullable: true }),
			nextKey: t.exposeString("nextKey", { nullable: true }),
			groups: t.field({ type: [GameSlotGroupRef], resolve: (r) => r.groups }),
		}),
	})

// Slot vocabulary is owned entirely by each week-window league's own sync
// module (see games.slot's comment in db/schema/sports.ts) - this is just the
// lookup from league slug to that module's maps, not a generic mechanism.
const SLOT_LABELS_BY_LEAGUE: Record<string, Record<string, string>> = {
	nfl: NFL_SLOT_LABELS,
}
const SLOT_ORDER_BY_LEAGUE: Record<string, string[]> = {
	nfl: NFL_SLOT_ORDER,
}

const ET_ZONE = "America/New_York"

// Every window this league has synced games for, oldest first. Date-window
// leagues (MLB/NBA) get one window per ET calendar date; week-window leagues
// (NFL) get one per (season, seasonType, weekNumber). Both are computed
// on read, grouped straight off `games` - there's no separate "windows"
// table, so a window only ever exists because a real game does.
async function getLeagueWindows(league: League): Promise<WindowDescriptor[]> {
	if (league.windowType === "week") {
		const result = await db.execute<{
			season_id: string
			season_type: "regular" | "postseason"
			week_number: number
			min_starts: string
			max_starts: string
			n: number
		}>(sql`
			select season_id, season_type, week_number,
				min(starts_at) as min_starts, max(starts_at) as max_starts,
				count(*)::int as n
			from games
			where league_id = ${league.id} and week_number is not null
			group by season_id, season_type, week_number
			order by min_starts asc
		`)
		return result.rows.map((row) => {
			const start = DateTime.fromJSDate(new Date(row.min_starts), {
				zone: ET_ZONE,
			})
			const end = DateTime.fromJSDate(new Date(row.max_starts), {
				zone: ET_ZONE,
			})
			const label =
				row.season_type === "postseason"
					? `POSTSEASON WEEK ${row.week_number}`
					: `WEEK ${row.week_number}`
			return {
				key: `${row.season_id}:${row.season_type}:${row.week_number}`,
				label,
				sublabel: `${start.toFormat("LLL d").toUpperCase()} – ${end.toFormat("LLL d").toUpperCase()}`,
				gameCount: row.n,
				rangeStart: start.startOf("day").toJSDate(),
				rangeEnd: end.endOf("day").toJSDate(),
			}
		})
	}

	const result = await db.execute<{ d: string; n: number }>(sql`
		select (starts_at at time zone 'UTC' at time zone ${ET_ZONE})::date as d,
			count(*)::int as n
		from games
		where league_id = ${league.id}
		group by d
		order by d asc
	`)
	return result.rows.map((row) => {
		const day = DateTime.fromISO(row.d, { zone: ET_ZONE })
		return {
			key: day.toFormat("yyyy-LL-dd"),
			label: day.toFormat("ccc LLL d").toUpperCase(),
			sublabel: null,
			gameCount: row.n,
			rangeStart: day.startOf("day").toJSDate(),
			rangeEnd: day.endOf("day").toJSDate(),
		}
	})
}

// windowKey omitted -> "today"/"this week" if it has synced games, else the
// nearest upcoming window, else the most recent past one.
function pickDefaultWindowIndex(windows: WindowDescriptor[]): number {
	const now = new Date()
	const currentIdx = windows.findIndex(
		(w) => w.rangeStart <= now && now <= w.rangeEnd,
	)
	if (currentIdx !== -1) return currentIdx
	const upcomingIdx = windows.findIndex((w) => w.rangeStart > now)
	if (upcomingIdx !== -1) return upcomingIdx
	return windows.length - 1
}

builder.queryFields((t) => ({
	sports: t.field({
		type: [SportRef],
		resolve: () => db.query.sports.findMany({ orderBy: { name: "asc" } }),
	}),

	leagues: t.field({
		type: [LeagueRef],
		args: { sportId: t.arg.id({ required: false }) },
		resolve: (_root, args) =>
			db.query.leagues.findMany({
				where: args.sportId ? { sportId: args.sportId } : undefined,
				orderBy: { name: "asc" },
			}),
	}),

	// The Data tab's league detail page header - not admin-gated, a league's
	// name isn't sensitive (same reasoning as the plain `leagues` list above).
	league: t.field({
		type: LeagueRef,
		nullable: true,
		args: { id: t.arg.id({ required: true }) },
		resolve: (_root, args) =>
			db.query.leagues.findFirst({ where: { id: args.id } }),
	}),

	// Single-game lookup, same reasoning as `league` above - lets the
	// create-question form's game field redisplay its current selection from
	// just the stored gameId after its own component remounts (switching
	// question type re-mounts the section it lives in), without keeping a
	// second, ephemeral copy of the game's data in local component state.
	game: t.field({
		type: GameRef,
		nullable: true,
		args: { id: t.arg.id({ required: true }) },
		resolve: (_root, args) =>
			db.query.games.findFirst({ where: { id: args.id } }),
	}),

	// Public, not admin-gated - powers the create-question form's "end of
	// regular season"/"end of playoffs" locksAt quick-fill chips (only
	// relevant once a league is picked, so a dedicated on-demand query rather
	// than bulk-loaded onto every League row alongside the sport/league
	// pickers). Server-derived, same getCurrentSeason used to auto-set a
	// game-less question's own seasonId at creation time - see
	// lib/seasons.ts.
	currentSeason: t.field({
		type: SeasonRef,
		nullable: true,
		args: { leagueId: t.arg.id({ required: true }) },
		resolve: (_root, args) => getCurrentSeason(args.leagueId),
	}),

	teams: t.field({
		type: [TeamRef],
		args: {
			leagueId: t.arg.id({ required: false }),
			// Typeahead mode - see players below. Only applies a limit when
			// search is given, so existing unbounded callers (a league's full
			// team list) are untouched.
			search: t.arg.string({ required: false }),
			first: t.arg.int({ required: false }),
		},
		resolve: (_root, args) => {
			const search = args.search?.trim()
			return db.query.teams.findMany({
				where: {
					...(args.leagueId ? { leagueId: args.leagueId } : {}),
					...(search
						? {
								OR: [
									{ name: { ilike: `%${search}%` } },
									{ abbreviation: { ilike: `%${search}%` } },
								],
							}
						: {}),
				},
				orderBy: { name: "asc" },
				...(search
					? { limit: Math.min(Math.max(args.first ?? 5, 1), 20) }
					: {}),
			})
		},
	}),

	players: t.field({
		type: [PlayerRef],
		args: {
			teamId: t.arg.id({ required: false }),
			leagueId: t.arg.id({ required: false }),
			// Typeahead mode - same shape as games' query/first below. Only
			// applies a limit when search is actually given, so the existing
			// unbounded roster callers (PlayersByLeague etc.) are untouched.
			search: t.arg.string({ required: false }),
			first: t.arg.int({ required: false }),
		},
		resolve: (_root, args) => {
			const search = args.search?.trim()
			return db.query.players.findMany({
				where: {
					...(args.teamId ? { currentTeamId: args.teamId } : {}),
					...(args.leagueId
						? { currentTeam: { leagueId: args.leagueId } }
						: {}),
					...(search ? { name: { ilike: `%${search}%` } } : {}),
				},
				orderBy: { name: "asc" },
				...(search
					? { limit: Math.min(Math.max(args.first ?? 8, 1), 20) }
					: {}),
			})
		},
	}),

	// Public, not admin-gated - same reasoning as teams/players above. Backs
	// the create-question form's game picker: scoped to a league and to
	// upcoming scheduled games only (nothing already live/final makes sense to
	// attach a new question to), with an optional free-text match against
	// either team's name/abbreviation to narrow down a league's full slate.
	// Deliberately not the admin/adminGames cursor-paginated connection - this
	// is a bounded typeahead result set, not something a caller pages through.
	games: t.field({
		type: [GameRef],
		args: {
			leagueId: t.arg.id({ required: true }),
			query: t.arg.string({ required: false }),
			first: t.arg.int({ required: false }),
		},
		resolve: (_root, args) => {
			const limit = Math.min(Math.max(args.first ?? 8, 1), 20)
			// Split into per-team search tokens rather than matching the raw
			// string as one substring - "denver boston"/"denver vs boston"
			// should find Denver @ Boston (or Boston @ Denver) even though no
			// single team is named "Denver Boston". Each token must match SOME
			// team (home or away, name or abbreviation) - that's the OR inside
			// each token's clause - but every token has to match something,
			// which is the AND across tokens below.
			const tokens = (args.query ?? "")
				.split(/\s+/)
				.map((t) => t.trim())
				.filter(
					(t) =>
						t.length > 0 && !["vs", "v", "at", "@"].includes(t.toLowerCase()),
				)
			return db.query.games.findMany({
				where: {
					leagueId: args.leagueId,
					status: "scheduled",
					startsAt: { gt: new Date() },
					...(tokens.length > 0
						? {
								AND: tokens.map((token) => ({
									OR: [
										{ homeTeam: { name: { ilike: `%${token}%` } } },
										{ homeTeam: { abbreviation: { ilike: `%${token}%` } } },
										{ awayTeam: { name: { ilike: `%${token}%` } } },
										{ awayTeam: { abbreviation: { ilike: `%${token}%` } } },
									],
								})),
							}
						: {}),
				},
				orderBy: { startsAt: "asc" },
				limit,
			})
		},
	}),

	// The league room's Games tab (public, not admin-gated - same reasoning as
	// `league`/`game` above). The bounds of what's steppable through at all -
	// the stepper UI walks this list rather than computing prev/next by date
	// arithmetic itself.
	leagueGameWindows: t.field({
		type: [GameWindowRef],
		args: { leagueId: t.arg.id({ required: true }) },
		resolve: async (_root, args) => {
			const league = await db.query.leagues.findFirst({
				where: { id: args.leagueId },
			})
			if (!league) return []
			return getLeagueWindows(league)
		},
	}),

	// One window's worth of games - a single day for a date-window league
	// (MLB/NBA) or a single week for a week-window league (NFL), grouped by
	// broadcast slot where the league has one. windowKey omitted -> the
	// server's own default (today/this week if it has games, else nearest
	// upcoming, else most recent past - see pickDefaultWindowIndex).
	leagueGamesForWindow: t.field({
		type: LeagueGamesForWindowResultRef,
		args: {
			leagueId: t.arg.id({ required: true }),
			windowKey: t.arg.string({ required: false }),
		},
		resolve: async (_root, args) => {
			const league = await db.query.leagues.findFirst({
				where: { id: args.leagueId },
			})
			if (!league) throw new NotFoundError("League not found")

			const windows = await getLeagueWindows(league)
			if (windows.length === 0) {
				return {
					window: {
						key: "",
						label: "No games scheduled",
						sublabel: null,
						gameCount: 0,
						rangeStart: new Date(),
						rangeEnd: new Date(),
					},
					prevKey: null,
					nextKey: null,
					groups: [],
				}
			}

			const requestedIndex = args.windowKey
				? windows.findIndex((w) => w.key === args.windowKey)
				: -1
			const index =
				requestedIndex !== -1 ? requestedIndex : pickDefaultWindowIndex(windows)
			const selected = windows[index]
			const prevKey = index > 0 ? windows[index - 1].key : null
			const nextKey = index < windows.length - 1 ? windows[index + 1].key : null

			if (league.windowType === "week") {
				const [seasonId, seasonType, weekNumberRaw] = selected.key.split(":")
				const rows = await db.query.games.findMany({
					where: {
						leagueId: league.id,
						seasonId,
						seasonType: seasonType as "regular" | "postseason",
						weekNumber: Number(weekNumberRaw),
					},
					orderBy: { startsAt: "asc" },
				})
				const order = SLOT_ORDER_BY_LEAGUE[league.slug] ?? []
				const labels = SLOT_LABELS_BY_LEAGUE[league.slug] ?? {}
				const knownSlots = new Set(order)
				const groups: SlotGroup[] = order
					.map((slotKey) => ({
						slotLabel: labels[slotKey] ?? slotKey,
						games: rows.filter((g) => g.slot === slotKey),
					}))
					.filter((g) => g.games.length > 0)
				const leftover = rows.filter((g) => !g.slot || !knownSlots.has(g.slot))
				if (leftover.length > 0)
					groups.push({ slotLabel: null, games: leftover })
				return { window: selected, prevKey, nextKey, groups }
			}

			const rows = await db.query.games.findMany({
				where: {
					leagueId: league.id,
					startsAt: { gte: selected.rangeStart, lte: selected.rangeEnd },
				},
				orderBy: { startsAt: "asc" },
			})
			return {
				window: selected,
				prevKey,
				nextKey,
				groups: rows.length > 0 ? [{ slotLabel: null, games: rows }] : [],
			}
		},
	}),

	// scoped to a sport, not a league - see the Stat type doc
	stats: t.field({
		type: [StatRef],
		args: { sportId: t.arg.id({ required: true }) },
		resolve: (_root, args) =>
			db.query.stats.findMany({
				where: { sportId: args.sportId },
				orderBy: { sortOrder: "asc" },
			}),
	}),

	// Data tab's own league list - the entry point admins pick a league from
	// before drilling into that league's teams/players/games (see
	// adminTeams/adminPlayers/adminGames below, all league-scoped for exactly
	// that reason).
	adminLeagues: t.field({
		type: AdminLeagueConnectionRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			first: t.arg.int({ required: false }),
			after: t.arg.string({ required: false }),
			sortBy: t.arg({ type: AdminLeagueSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = clampAdminPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sortDir = args.sortDir ?? "asc"
			const column = args.sortBy === "status" ? leagues.status : leagues.name

			const rows = await db
				.select()
				.from(leagues)
				.orderBy(sortColumn(sortDir, column), asc(leagues.id))
				.limit(limit + 1)
				.offset(offset)
			return buildAdminConnection(rows, limit, offset)
		},
	}),

	// League-scoped - picking a league on the Data tab is what surfaces this
	// (see adminLeagues above), there's no cross-league "all teams" admin view.
	adminTeams: t.field({
		type: AdminTeamConnectionRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			leagueId: t.arg.id({ required: true }),
			first: t.arg.int({ required: false }),
			after: t.arg.string({ required: false }),
			sortBy: t.arg({ type: AdminTeamSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = clampAdminPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sortDir = args.sortDir ?? "asc"
			const column =
				args.sortBy === "abbreviation" ? teams.abbreviation : teams.name

			const rows = await db
				.select()
				.from(teams)
				.where(eq(teams.leagueId, args.leagueId))
				.orderBy(sortColumn(sortDir, column), asc(teams.id))
				.limit(limit + 1)
				.offset(offset)
			return buildAdminConnection(rows, limit, offset)
		},
	}),

	// League-scoped via an inner join to teams, same reasoning as adminTeams -
	// a free-agent player (currentTeamId null) belongs to no league, so
	// naturally never appears in any league's player list.
	adminPlayers: t.field({
		type: AdminPlayerConnectionRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			leagueId: t.arg.id({ required: true }),
			first: t.arg.int({ required: false }),
			after: t.arg.string({ required: false }),
			sortBy: t.arg({ type: AdminPlayerSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = clampAdminPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sortDir = args.sortDir ?? "asc"
			const column =
				args.sortBy === "position" ? players.position : players.name

			const rows = await db
				.select({ ...getColumns(players) })
				.from(players)
				.innerJoin(teams, eq(teams.id, players.currentTeamId))
				.where(eq(teams.leagueId, args.leagueId))
				.orderBy(sortColumn(sortDir, column), asc(players.id))
				.limit(limit + 1)
				.offset(offset)
			return buildAdminConnection(rows, limit, offset)
		},
	}),

	// League-scoped - no other games list query exists (games are normally
	// only reached via Question.game).
	adminGames: t.field({
		type: AdminGameConnectionRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			leagueId: t.arg.id({ required: true }),
			first: t.arg.int({ required: false }),
			after: t.arg.string({ required: false }),
			sortBy: t.arg({ type: AdminGameSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const limit = clampAdminPageSize(args.first)
			const offset = args.after ? decodeOffsetCursor(args.after) : 0
			const sortDir = args.sortDir ?? "desc"
			const column = args.sortBy === "status" ? games.status : games.startsAt

			const rows = await db
				.select()
				.from(games)
				.where(eq(games.leagueId, args.leagueId))
				.orderBy(sortColumn(sortDir, column), asc(games.id))
				.limit(limit + 1)
				.offset(offset)
			return buildAdminConnection(rows, limit, offset)
		},
	}),
}))

const CreateLeagueInput = builder.inputType("CreateLeagueInput", {
	fields: (t) => ({
		sportId: t.id({ required: true }),
		name: t.string({ required: true }),
		abbreviation: t.string({ required: true }),
		slug: t.string({ required: true }),
		status: t.field({ type: LeagueStatus, required: false }),
	}),
})
const UpdateLeagueInput = builder.inputType("UpdateLeagueInput", {
	fields: (t) => ({
		id: t.id({ required: true }),
		sportId: t.id({ required: true }),
		name: t.string({ required: true }),
		abbreviation: t.string({ required: true }),
		slug: t.string({ required: true }),
		status: t.field({ type: LeagueStatus, required: false }),
	}),
})

const CreateTeamInput = builder.inputType("CreateTeamInput", {
	fields: (t) => ({
		leagueId: t.id({ required: true }),
		name: t.string({ required: true }),
		abbreviation: t.string({ required: true }),
		color: t.string({ required: true }),
		conference: t.string({ required: false }),
		division: t.string({ required: false }),
	}),
})
const UpdateTeamInput = builder.inputType("UpdateTeamInput", {
	fields: (t) => ({
		id: t.id({ required: true }),
		leagueId: t.id({ required: true }),
		name: t.string({ required: true }),
		abbreviation: t.string({ required: true }),
		color: t.string({ required: true }),
		conference: t.string({ required: false }),
		division: t.string({ required: false }),
	}),
})

const CreatePlayerInput = builder.inputType("CreatePlayerInput", {
	fields: (t) => ({
		currentTeamId: t.id({ required: false }),
		name: t.string({ required: true }),
		position: t.string({ required: false }),
	}),
})
const UpdatePlayerInput = builder.inputType("UpdatePlayerInput", {
	fields: (t) => ({
		id: t.id({ required: true }),
		currentTeamId: t.id({ required: false }),
		name: t.string({ required: true }),
		position: t.string({ required: false }),
	}),
})

const CreateGameInput = builder.inputType("CreateGameInput", {
	fields: (t) => ({
		leagueId: t.id({ required: true }),
		homeTeamId: t.id({ required: true }),
		awayTeamId: t.id({ required: true }),
		startsAt: t.string({ required: true }),
		status: t.field({ type: GameStatus, required: false }),
		homeScore: t.int({ required: false }),
		awayScore: t.int({ required: false }),
	}),
})
const UpdateGameInput = builder.inputType("UpdateGameInput", {
	fields: (t) => ({
		id: t.id({ required: true }),
		leagueId: t.id({ required: true }),
		homeTeamId: t.id({ required: true }),
		awayTeamId: t.id({ required: true }),
		startsAt: t.string({ required: true }),
		status: t.field({ type: GameStatus, required: false }),
		homeScore: t.int({ required: false }),
		awayScore: t.int({ required: false }),
	}),
})

builder.mutationFields((t) => ({
	createLeague: t.field({
		type: LeagueRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
			directResult: true,
			union: { name: "CreateLeagueResult" },
		},
		args: { input: t.arg({ type: CreateLeagueInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = createLeagueSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const data = parsed.data

			const existing = await db.query.leagues.findFirst({
				where: { slug: data.slug },
			})
			if (existing) throw ValidationError.field("slug", "That slug is taken")

			const [created] = await db.insert(leagues).values(data).returning()
			if (!created) throw new Error("createLeague: insert returned nothing")
			return created
		},
	}),

	updateLeague: t.field({
		type: LeagueRef,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "UpdateLeagueResult" },
		},
		args: { input: t.arg({ type: UpdateLeagueInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = updateLeagueSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const { id, ...data } = parsed.data

			const existing = await db.query.leagues.findFirst({
				where: { slug: data.slug, id: { ne: id } },
			})
			if (existing) throw ValidationError.field("slug", "That slug is taken")

			const [updated] = await db
				.update(leagues)
				.set(data)
				.where(eq(leagues.id, id))
				.returning()
			if (!updated) throw new NotFoundError("League not found")
			return updated
		},
	}),

	createTeam: t.field({
		type: TeamRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
			directResult: true,
			union: { name: "CreateTeamResult" },
		},
		args: { input: t.arg({ type: CreateTeamInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = createTeamSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const data = parsed.data

			const existing = await db.query.teams.findFirst({
				where: { leagueId: data.leagueId, abbreviation: data.abbreviation },
			})
			if (existing) {
				throw ValidationError.field(
					"abbreviation",
					"A team with that abbreviation already exists in this league",
				)
			}

			const [created] = await db
				.insert(teams)
				.values({
					...data,
					conference: data.conference || null,
					division: data.division || null,
				})
				.returning()
			if (!created) throw new Error("createTeam: insert returned nothing")
			return created
		},
	}),

	updateTeam: t.field({
		type: TeamRef,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "UpdateTeamResult" },
		},
		args: { input: t.arg({ type: UpdateTeamInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = updateTeamSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const { id, ...data } = parsed.data

			const existing = await db.query.teams.findFirst({
				where: {
					leagueId: data.leagueId,
					abbreviation: data.abbreviation,
					id: { ne: id },
				},
			})
			if (existing) {
				throw ValidationError.field(
					"abbreviation",
					"A team with that abbreviation already exists in this league",
				)
			}

			const [updated] = await db
				.update(teams)
				.set({
					...data,
					conference: data.conference || null,
					division: data.division || null,
				})
				.where(eq(teams.id, id))
				.returning()
			if (!updated) throw new NotFoundError("Team not found")
			return updated
		},
	}),

	createPlayer: t.field({
		type: PlayerRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
			directResult: true,
			union: { name: "CreatePlayerResult" },
		},
		args: { input: t.arg({ type: CreatePlayerInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = createPlayerSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const data = parsed.data

			const [created] = await db
				.insert(players)
				.values({ ...data, position: data.position || null })
				.returning()
			if (!created) throw new Error("createPlayer: insert returned nothing")
			return created
		},
	}),

	updatePlayer: t.field({
		type: PlayerRef,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "UpdatePlayerResult" },
		},
		args: { input: t.arg({ type: UpdatePlayerInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = updatePlayerSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const { id, ...data } = parsed.data

			const [updated] = await db
				.update(players)
				.set({ ...data, position: data.position || null })
				.where(eq(players.id, id))
				.returning()
			if (!updated) throw new NotFoundError("Player not found")
			return updated
		},
	}),

	createGame: t.field({
		type: GameRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
			directResult: true,
			union: { name: "CreateGameResult" },
		},
		args: { input: t.arg({ type: CreateGameInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = createGameSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const { startsAt, ...rest } = parsed.data

			// Manually-entered games (no ESPN event backing them) get the same
			// current-season derivation as everything else - see createQuestion's
			// own seasonId comment in graphql/types/question.ts.
			const seasonId = (await getCurrentSeason(rest.leagueId))?.id
			if (!seasonId) {
				throw ValidationError.field(
					"leagueId",
					"This league isn't set up yet - no season data has synced for it.",
				)
			}

			const [created] = await db
				.insert(games)
				.values({ ...rest, seasonId, startsAt: new Date(startsAt) })
				.returning()
			if (!created) throw new Error("createGame: insert returned nothing")
			return created
		},
	}),

	updateGame: t.field({
		type: GameRef,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "UpdateGameResult" },
		},
		args: { input: t.arg({ type: UpdateGameInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const parsed = updateGameSchema.safeParse(args.input)
			if (!parsed.success)
				throw ValidationError.fromZodIssues(parsed.error.issues)
			const { id, startsAt, ...rest } = parsed.data

			const [updated] = await db
				.update(games)
				.set({ ...rest, startsAt: new Date(startsAt) })
				.where(eq(games.id, id))
				.returning()
			if (!updated) throw new NotFoundError("Game not found")
			return updated
		},
	}),
}))
