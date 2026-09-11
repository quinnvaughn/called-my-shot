import { setTimeout as sleep } from "node:timers/promises"
import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { and, eq } from "drizzle-orm"
import { DateTime } from "luxon"
import { match } from "ts-pattern"
import { isMainModule } from "../../lib/is-main-module"
import { db } from "../index"
import { type Game, gameStarters, games } from "../schema"
import {
	type EspnDepthChart,
	EspnRequestError,
	fetchDepthChart,
	fetchGameSummaryRosters,
	fetchScoreboardRange,
} from "./espn-client"
import { SYNCED_LEAGUES, type SyncLeagueConfig } from "./leagues"
import {
	type ParsedStarterGroup,
	parseBattingOrders,
	parseNbaDepthChart,
	parseNflDepthChart,
	parseProbables,
} from "./starters-parse"
import { scopedSourceId } from "./sync-refs"

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// MLB batting orders get posted a few hours before first pitch (seen live
// roughly 2-4h out), so the per-game summary call is only made inside this
// window. Before it, the lineup is never there.
const LINEUP_WINDOW_MS = 3 * HOUR_MS

// The job runs every 30 minutes. Without this, a refresh that comes due a few
// seconds after a tick waits a whole extra tick, and the schedule drifts later
// every day.
const TICK_SLACK_MS = 5 * MINUTE_MS

// ESPN publishes no limits for these unauthenticated endpoints, so requests go
// out one at a time with a gap and a run never bursts.
const DEFAULT_SPACING_MS = 250

// ESPN turning us away. Anything else is one failed request.
const REFUSAL_STATUSES = [403, 429]

type StarterSource = "probables" | "depth_chart"

type DepthChartParser = (
	espnTeamId: string,
	charts: EspnDepthChart[],
) => ParsedStarterGroup[]

type StarterPlan =
	| { source: "probables"; horizonMs: number }
	| { source: "depth_chart"; horizonMs: number; parse: DepthChartParser }

// How far ahead each league's starters are fetched. MLB probables are posted a
// few days out, an NFL depth chart matters all week, and NBA teams play every
// other day or so, so two days covers each team's next game.
function starterPlanFor(leagueSlug: string): StarterPlan | null {
	return match(leagueSlug)
		.returnType<StarterPlan | null>()
		.with("mlb", () => ({ source: "probables", horizonMs: 3 * DAY_MS }))
		.with("nfl", () => ({
			source: "depth_chart",
			horizonMs: 7 * DAY_MS,
			parse: parseNflDepthChart,
		}))
		.with("nba", () => ({
			source: "depth_chart",
			horizonMs: 2 * DAY_MS,
			parse: parseNbaDepthChart,
		}))
		.otherwise(() => null)
}

// How stale a game's starters may get before it's due again. Tighter as first
// pitch nears, since that's when probables get scratched and lineups get
// posted - inside the lineup window it's every run. Depth charts move far more
// slowly, so they never go below 6h.
function maxAgeMs(source: StarterSource, msUntilStart: number): number {
	if (msUntilStart > DAY_MS) return DAY_MS
	return match(source)
		.with("probables", () =>
			msUntilStart > LINEUP_WINDOW_MS ? 4 * HOUR_MS : 0,
		)
		.with("depth_chart", () => 6 * HOUR_MS)
		.exhaustive()
}

export function isStartersRefreshDue(
	game: Pick<Game, "startsAt" | "startersSyncedAt">,
	source: StarterSource,
	now: Date,
): boolean {
	if (!game.startersSyncedAt) return true
	const age = now.getTime() - game.startersSyncedAt.getTime()
	const msUntilStart = game.startsAt.getTime() - now.getTime()
	return age + TICK_SLACK_MS >= maxAgeMs(source, msUntilStart)
}

type Requester = ReturnType<typeof createRequester>

// One run's access to ESPN. Spaces requests out, counts them for the log line,
// and splits failures in two: ESPN refusing us throws and ends the run, while
// any other failure is logged and returns null, leaving the affected games due
// for the next run.
function createRequester(spacingMs: number) {
	let lastRequestAt = 0
	let count = 0

	async function request<T>(
		label: string,
		fetcher: () => Promise<T>,
	): Promise<T | null> {
		const wait = lastRequestAt + spacingMs - Date.now()
		if (wait > 0) await sleep(wait)
		count++
		try {
			return await fetcher()
		} catch (err) {
			if (
				err instanceof EspnRequestError &&
				REFUSAL_STATUSES.includes(err.status)
			) {
				throw err
			}
			console.error(`[sync-game-starters] ${label} failed:`, err)
			return null
		} finally {
			lastRequestAt = Date.now()
		}
	}

	return { request, count: () => count }
}

const espnIdOf = (sourceId: string) => sourceId.split(":")[1] ?? sourceId

async function loadEspnIds(dueGames: Game[]) {
	const teamIds = [
		...new Set(dueGames.flatMap((g) => [g.homeTeamId, g.awayTeamId])),
	]
	const [gameRefs, teamRefs] = await Promise.all([
		db.query.externalRefs.findMany({
			where: {
				source: "espn",
				entityType: "game",
				entityId: { in: dueGames.map((g) => g.id) },
			},
		}),
		db.query.externalRefs.findMany({
			where: { source: "espn", entityType: "team", entityId: { in: teamIds } },
		}),
	])
	return {
		espnEventIdByGameId: new Map(
			gameRefs.map((ref) => [ref.entityId, espnIdOf(ref.sourceId)]),
		),
		espnTeamIdByTeamId: new Map(
			teamRefs.map((ref) => [ref.entityId, espnIdOf(ref.sourceId)]),
		),
		teamIdByEspnTeamId: new Map(
			teamRefs.map((ref) => [espnIdOf(ref.sourceId), ref.entityId]),
		),
	}
}

// Replaces each group's rows for this game, then stamps startersSyncedAt when
// the refresh was complete. syncedAt is null when part of it failed, which
// keeps the game due so the next run fills the gap. A group for a team that
// isn't in this game is ignored.
async function saveStarters(
	leagueSlug: string,
	game: Game,
	teamIdByEspnTeamId: Map<string, string>,
	groups: ParsedStarterGroup[],
	syncedAt: Date | null,
): Promise<void> {
	const athleteSourceIds = groups.flatMap((group) =>
		group.starters.map((s) => scopedSourceId(leagueSlug, s.espnAthleteId)),
	)

	await db.transaction(async (tx) => {
		const playerRefs =
			athleteSourceIds.length > 0
				? await tx.query.externalRefs.findMany({
						where: {
							source: "espn",
							entityType: "player",
							sourceId: { in: athleteSourceIds },
						},
					})
				: []
		const playerIdBySourceId = new Map(
			playerRefs.map((ref) => [ref.sourceId, ref.entityId]),
		)

		for (const group of groups) {
			const teamId = teamIdByEspnTeamId.get(group.espnTeamId)
			if (
				!teamId ||
				(teamId !== game.homeTeamId && teamId !== game.awayTeamId)
			) {
				continue
			}
			await tx
				.delete(gameStarters)
				.where(
					and(
						eq(gameStarters.gameId, game.id),
						eq(gameStarters.teamId, teamId),
						eq(gameStarters.role, group.role),
					),
				)
			if (group.starters.length === 0) continue
			await tx.insert(gameStarters).values(
				group.starters.map((starter) => ({
					gameId: game.id,
					teamId,
					playerId:
						playerIdBySourceId.get(
							scopedSourceId(leagueSlug, starter.espnAthleteId),
						) ?? null,
					role: group.role,
					sortOrder: starter.sortOrder,
					playerName: starter.playerName,
					position: starter.position,
					statLine: starter.statLine,
					injuryStatus: starter.injuryStatus,
				})),
			)
		}

		if (syncedAt) {
			await tx
				.update(games)
				.set({ startersSyncedAt: syncedAt })
				.where(eq(games.id, game.id))
		}
	})
}

const toEspnDate = (date: Date) =>
	DateTime.fromJSDate(date, { zone: SPORTS_TIME_ZONE }).toFormat("yyyyLLdd")

// One scoreboard call covers every due game's probables. Games inside the
// lineup window also get their own summary call for the batting orders.
// Returns how many games were fully refreshed.
async function syncProbables(
	config: SyncLeagueConfig,
	dueGames: Game[],
	now: Date,
	requester: Requester,
): Promise<number> {
	const first = dueGames[0]
	const last = dueGames[dueGames.length - 1]
	if (!first || !last) return 0

	const scoreboard = await requester.request(
		`${config.leagueSlug} scoreboard`,
		() =>
			fetchScoreboardRange(
				config.espnPath,
				toEspnDate(first.startsAt),
				toEspnDate(last.startsAt),
			),
	)
	if (!scoreboard) return 0

	const ids = await loadEspnIds(dueGames)
	let refreshed = 0

	for (const game of dueGames) {
		const espnEventId = ids.espnEventIdByGameId.get(game.id)
		const event = scoreboard.find((e) => e.id === espnEventId)
		// Not on the scoreboard (postponed, or moved outside the range): nothing
		// to change. It's still marked synced, so the game doesn't pull the
		// scoreboard again every run while it's missing.
		const groups = event ? parseProbables(event) : []
		let complete = true

		const inLineupWindow =
			game.startsAt.getTime() - now.getTime() <= LINEUP_WINDOW_MS
		if (event && inLineupWindow) {
			const rosters = await requester.request(
				`${config.leagueSlug} summary ${event.id}`,
				() => fetchGameSummaryRosters(config.espnPath, event.id),
			)
			if (rosters) {
				groups.push(...parseBattingOrders(rosters))
			} else {
				complete = false
			}
		}

		await saveStarters(
			config.leagueSlug,
			game,
			ids.teamIdByEspnTeamId,
			groups,
			complete ? now : null,
		)
		if (complete) refreshed++
	}
	return refreshed
}

// One depth chart call per team, however many due games it has in the window.
// Returns how many games were fully refreshed.
async function syncDepthCharts(
	config: SyncLeagueConfig,
	parse: DepthChartParser,
	dueGames: Game[],
	now: Date,
	requester: Requester,
): Promise<number> {
	const ids = await loadEspnIds(dueGames)
	// null marks a team whose chart couldn't be fetched this run.
	const groupsByTeamId = new Map<string, ParsedStarterGroup[] | null>()

	for (const game of dueGames) {
		for (const teamId of [game.awayTeamId, game.homeTeamId]) {
			if (groupsByTeamId.has(teamId)) continue
			const espnTeamId = ids.espnTeamIdByTeamId.get(teamId)
			if (!espnTeamId) {
				groupsByTeamId.set(teamId, null)
				continue
			}
			const charts = await requester.request(
				`${config.leagueSlug} depth chart ${espnTeamId}`,
				() => fetchDepthChart(config.espnPath, espnTeamId),
			)
			groupsByTeamId.set(teamId, charts ? parse(espnTeamId, charts) : null)
		}
	}

	let refreshed = 0
	for (const game of dueGames) {
		const away = groupsByTeamId.get(game.awayTeamId) ?? null
		const home = groupsByTeamId.get(game.homeTeamId) ?? null
		const complete = away !== null && home !== null
		await saveStarters(
			config.leagueSlug,
			game,
			ids.teamIdByEspnTeamId,
			[...(away ?? []), ...(home ?? [])],
			complete ? now : null,
		)
		if (complete) refreshed++
	}
	return refreshed
}

export async function syncGameStarters({
	now = new Date(),
	spacingMs = DEFAULT_SPACING_MS,
}: {
	now?: Date
	spacingMs?: number
} = {}): Promise<void> {
	const leaguePlans = SYNCED_LEAGUES.flatMap((config) => {
		const plan = starterPlanFor(config.leagueSlug)
		return plan ? [{ config, plan }] : []
	})
	const longestHorizonMs = Math.max(
		0,
		...leaguePlans.map(({ plan }) => plan.horizonMs),
	)

	const upcoming = await db.query.games.findMany({
		where: {
			status: "scheduled",
			startsAt: {
				gt: now,
				lte: new Date(now.getTime() + longestHorizonMs),
			},
		},
		with: { league: true },
		orderBy: { startsAt: "asc" },
	})

	const requester = createRequester(spacingMs)

	for (const { config, plan } of leaguePlans) {
		const dueGames = upcoming.filter(
			(game) =>
				game.league?.slug === config.leagueSlug &&
				game.startsAt.getTime() - now.getTime() <= plan.horizonMs &&
				isStartersRefreshDue(game, plan.source, now),
		)
		if (dueGames.length === 0) continue

		const refreshed = await match(plan)
			.with({ source: "probables" }, () =>
				syncProbables(config, dueGames, now, requester),
			)
			.with({ source: "depth_chart" }, ({ parse }) =>
				syncDepthCharts(config, parse, dueGames, now, requester),
			)
			.exhaustive()
		console.log(
			`[sync-game-starters] ${config.leagueSlug}: refreshed ${refreshed} of ${dueGames.length} due game(s)`,
		)
	}

	console.log(`[sync-game-starters] done, ${requester.count()} ESPN request(s)`)
}

if (isMainModule(import.meta.url)) {
	syncGameStarters()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
}
