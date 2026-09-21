import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { and, eq } from "drizzle-orm"
import { DateTime } from "luxon"
import { match } from "ts-pattern"
import { SYNC_GAME_STARTERS_LOCK } from "../../lib/job-lock"
import { runCli } from "../../lib/run-cli"
import { DAY_MS, HOUR_MS, MINUTE_MS } from "../../lib/time"
import { db } from "../index"
import { type Game, gameStarters, games } from "../schema"
import {
	defaultEspnClient,
	type EspnClient,
	type EspnDepthChart,
} from "./espn-client"
import {
	createEspnRequester,
	DEFAULT_ESPN_SPACING_MS,
	type EspnRequester,
} from "./espn-requester"
import { SYNCED_LEAGUES, type SyncLeagueConfig } from "./leagues"
import {
	type ParsedStarterGroup,
	parseBattingOrders,
	parseNbaDepthChart,
	parseNflDepthChart,
	parseProbables,
} from "./starters-parse"
import { byEspnId, loadEspnIds, scopedSourceId } from "./sync-refs"

// MLB batting orders get posted a few hours before first pitch (seen live
// roughly 2-4h out), so the per-game summary call is only made inside this
// window. Before it, the lineup is never there.
const LINEUP_WINDOW_MS = 3 * HOUR_MS

// The job runs every 30 minutes. Without this, a refresh that comes due a few
// seconds after a tick waits a whole extra tick, and the schedule drifts later
// every day.
const TICK_SLACK_MS = 5 * MINUTE_MS

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

// What one run reads ESPN through.
type EspnAccess = { espn: EspnClient; requester: EspnRequester }

async function loadEspnIdsFor(dueGames: Game[]) {
	const [espnEventIdByGameId, espnTeamIdByTeamId] = await Promise.all([
		loadEspnIds(
			"game",
			dueGames.map((g) => g.id),
		),
		loadEspnIds(
			"team",
			dueGames.flatMap((g) => [g.homeTeamId, g.awayTeamId]),
		),
	])
	return {
		espnEventIdByGameId,
		espnTeamIdByTeamId,
		teamIdByEspnTeamId: byEspnId(espnTeamIdByTeamId),
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
	{ espn, requester }: EspnAccess,
): Promise<number> {
	const first = dueGames[0]
	const last = dueGames[dueGames.length - 1]
	if (!first || !last) return 0

	const scoreboard = await requester.request(
		`${config.leagueSlug} scoreboard`,
		() =>
			espn.fetchScoreboardRange(
				config.espnPath,
				toEspnDate(first.startsAt),
				toEspnDate(last.startsAt),
			),
	)
	if (!scoreboard) return 0

	const ids = await loadEspnIdsFor(dueGames)
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
				() => espn.fetchGameSummaryRosters(config.espnPath, event.id),
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
	{ espn, requester }: EspnAccess,
): Promise<number> {
	const ids = await loadEspnIdsFor(dueGames)
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
				() => espn.fetchDepthChart(config.espnPath, espnTeamId),
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
	spacingMs = DEFAULT_ESPN_SPACING_MS,
	espn = defaultEspnClient,
}: {
	now?: Date
	spacingMs?: number
	espn?: EspnClient
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

	const requester = createEspnRequester("sync-game-starters", spacingMs)
	const access = { espn, requester }

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
				syncProbables(config, dueGames, now, access),
			)
			.with({ source: "depth_chart" }, ({ parse }) =>
				syncDepthCharts(config, parse, dueGames, now, access),
			)
			.exhaustive()
		console.log(
			`[sync-game-starters] ${config.leagueSlug}: refreshed ${refreshed} of ${dueGames.length} due game(s)`,
		)
	}

	console.log(`[sync-game-starters] done, ${requester.count()} ESPN request(s)`)
}

runCli(import.meta.url, syncGameStarters, { lock: SYNC_GAME_STARTERS_LOCK })
