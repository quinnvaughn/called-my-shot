import { asc, eq, getColumns } from "drizzle-orm"
import { db } from "../../../db"
import type { Game } from "../../../db/schema"
import { games, leagues, players, teams } from "../../../db/schema"
import { SLOT_LABELS_BY_LEAGUE } from "../../../db/sync/slot-labels"
import {
	adminListArgs,
	buildAdminConnection,
	sortColumn,
} from "../../../lib/admin-pagination"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
} from "../../../lib/errors"
import { roundLabel } from "../../../lib/postseason/series"
import { getCurrentSeason, listLeagueSeasons } from "../../../lib/seasons"
import { isUuid } from "../../../lib/uuid"
import { getLeagueWindows, pickDefaultWindowIndex } from "../../../lib/windows"
import { builder } from "../../builder"
import { clampTypeahead } from "../../helpers"
import { SortDirection } from "../pagination"
import {
	AdminGameConnectionRef,
	AdminLeagueConnectionRef,
	AdminPlayerConnectionRef,
	AdminTeamConnectionRef,
} from "./admin-connections"
import { PlayerRef, StatRef } from "./catalog"
import {
	AdminGameSort,
	AdminLeagueSort,
	AdminPlayerSort,
	AdminTeamSort,
} from "./enums"
import { GameRef } from "./game"
import { LeagueRef, SeasonRef, SportRef } from "./league"
import { TeamRef } from "./team"
import {
	GameWindowRef,
	LeagueGamesForWindowResultRef,
	type SlotGroup,
} from "./windows"

// Games sharing a kickoff (a Sunday early slate, a night of 7:05 first
// pitches) are ordered by away team name, so the list reads predictably and
// holds its order as scores update.
function byKickoffThenAwayTeam(
	a: Game & { awayTeam: { name: string } | null },
	b: Game & { awayTeam: { name: string } | null },
) {
	return (
		a.startsAt.getTime() - b.startsAt.getTime() ||
		(a.awayTeam?.name ?? "").localeCompare(b.awayTeam?.name ?? "")
	)
}

// A day's games under one heading per postseason round ("ALDS", "NL Wild
// Card Series"), in the order each round first plays that day, so a playoff
// day reads as its series rather than one undifferentiated list. Regular-season
// games, and a day with no postseason games at all, stay a single unlabeled
// group.
function groupByRound(rows: Game[]): SlotGroup[] {
	if (rows.length === 0) return []
	if (!rows.some((game) => game.postseasonRound)) {
		return [{ slotLabel: null, games: rows }]
	}
	const byRound = new Map<string | null, Game[]>()
	for (const game of rows) {
		const key = game.postseasonRound ? roundLabel(game.postseasonRound) : null
		const group = byRound.get(key)
		if (group) group.push(game)
		else byRound.set(key, [game])
	}
	return [...byRound].map(([slotLabel, games]) => ({ slotLabel, games }))
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
			isUuid(args.id)
				? db.query.leagues.findFirst({ where: { id: args.id } })
				: null,
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
			isUuid(args.id)
				? db.query.games.findFirst({ where: { id: args.id } })
				: null,
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

	// Every season a league has synced rows for, newest first - backs the admin
	// ballot list's season picker, which needs the full set rather than just
	// the current one (ordering last year's ballots is a real thing to want).
	// Public for the same reason currentSeason is: it's ESPN calendar data.
	// Note that the newest year isn't necessarily the current season - the sync
	// pulls [thisYear, thisYear + 1], so callers wanting a sensible default
	// should ask currentSeason rather than take the first row here, and callers
	// building a picker over seasons that can actually have data should pass
	// startedOnly.
	leagueSeasons: t.field({
		type: [SeasonRef],
		args: {
			leagueId: t.arg.id({ required: true }),
			startedOnly: t.arg.boolean({ required: false }),
		},
		resolve: (_root, args) =>
			listLeagueSeasons(args.leagueId, { startedOnly: !!args.startedOnly }),
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
				...(search ? { limit: clampTypeahead(args.first, 5) } : {}),
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
				...(search ? { limit: clampTypeahead(args.first, 8) } : {}),
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
			const limit = clampTypeahead(args.first, 8)
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
				orderBy: { startsAt: "asc", id: "asc" },
				limit,
			})
		},
	}),

	// Every game in the league's current season, for /sitemap.xml only - which
	// is why it is unpaginated where `games` above is capped at 20, and why it
	// takes no filters. A crawler needs the whole set at once; nothing in the
	// UI should call this. Scoped to the current season rather than all time
	// so the file doesn't grow without bound as seasons accumulate.
	sitemapGames: t.field({
		type: [GameRef],
		args: { leagueId: t.arg.id({ required: true }) },
		resolve: async (_root, args) => {
			const currentSeason = await getCurrentSeason(args.leagueId)
			if (!currentSeason) return []
			return db.query.games.findMany({
				where: { leagueId: args.leagueId, seasonId: currentSeason.id },
				orderBy: { startsAt: "asc", id: "asc" },
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
					leagueId: league.id,
					window: {
						key: "",
						// Never read - a league with no synced games has no groups to
						// filter and the stepper renders its own empty state - but the
						// descriptor has to be whole.
						scope: { kind: "day" as const, day: "" },
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

			if (selected.scope.kind === "week") {
				const { seasonId, seasonType, weekNumber } = selected.scope
				const rows = await db.query.games.findMany({
					where: { leagueId: league.id, seasonId, seasonType, weekNumber },
					with: { awayTeam: true },
					orderBy: { startsAt: "asc", id: "asc" },
				})
				rows.sort(byKickoffThenAwayTeam)
				const labels = SLOT_LABELS_BY_LEAGUE[league.slug] ?? {}
				// Groups come out in kickoff order rather than a fixed list of
				// slots, because the league's week has no fixed shape - a
				// Wednesday opener, a Saturday slate in December, a Friday game.
				// `rows` is already sorted by kickoff, so a Map keyed by slot
				// picks up each group in the order its first game is played.
				const bySlot = new Map<string, Game[]>()
				const unslotted: Game[] = []
				for (const game of rows) {
					if (!game.slot) {
						unslotted.push(game)
						continue
					}
					const group = bySlot.get(game.slot)
					if (group) group.push(game)
					else bySlot.set(game.slot, [game])
				}
				const groups: SlotGroup[] = [...bySlot].map(([slotKey, games]) => ({
					// A slot with no label is one this league's sync module has
					// since stopped producing - show the raw key rather than
					// silently dropping the games.
					slotLabel: labels[slotKey] ?? slotKey,
					games,
				}))
				if (unslotted.length > 0)
					groups.push({ slotLabel: null, games: unslotted })
				return {
					leagueId: league.id,
					window: selected,
					prevKey,
					nextKey,
					groups,
				}
			}

			const rows = await db.query.games.findMany({
				where: {
					leagueId: league.id,
					startsAt: { gte: selected.rangeStart, lte: selected.rangeEnd },
				},
				with: { awayTeam: true },
				orderBy: { startsAt: "asc", id: "asc" },
			})
			rows.sort(byKickoffThenAwayTeam)
			return {
				leagueId: league.id,
				window: selected,
				prevKey,
				nextKey,
				groups: groupByRound(rows),
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
			const { limit, offset, sortDir } = adminListArgs(ctx, args)
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
			const { limit, offset, sortDir } = adminListArgs(ctx, args)
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
			const { limit, offset, sortDir } = adminListArgs(ctx, args)
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
			const { limit, offset, sortDir } = adminListArgs(ctx, args, "desc")
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
