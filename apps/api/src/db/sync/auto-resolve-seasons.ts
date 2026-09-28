import {
	autoResolutionSource,
	autoResolveStatKeyFor,
} from "@called-my-shot/schemas"
import { sql } from "drizzle-orm"
import { autoResolveNotes } from "../../lib/auto-resolve/apply"
import { type Decision, fail } from "../../lib/auto-resolve/decide"
import {
	EXTRACTORS,
	type SeasonExtractor,
	type SeasonSourceNeed,
	type SeasonSources,
} from "../../lib/auto-resolve/registry"
import {
	decideSeasonQuestion,
	decideTeamSeasonLeader,
} from "../../lib/auto-resolve/season-decide"
import {
	isSeasonResolutionDue,
	seasonSettlesAt,
} from "../../lib/auto-resolve/season-due"
import { AUTO_RESOLVE_SEASONS_LOCK } from "../../lib/job-lock"
import { runCli } from "../../lib/run-cli"
import { HOUR_MS } from "../../lib/time"
import { db } from "../index"
import {
	type AutoResolveJobOptions,
	type AutoResolveRun,
	applierFor,
	loadDueCandidates,
	runAutoResolveJob,
} from "./auto-resolve-job"
import { SYNCED_LEAGUES } from "./leagues"
import {
	flattenCategorizedStatistics,
	parseStandingsWins,
} from "./season-stats-parse"
import { loadEspnIds } from "./sync-refs"

// How long past the season settling a retryable failure keeps being retried
// before the question is handed to an admin. The job runs daily, so this is
// two more tries.
export const SEASON_ESCALATE_AFTER_MS = 48 * HOUR_MS

const NOTES = autoResolveNotes("ESPN's regular-season stats")

// The season-long shapes a stat settles. Awards and championships aren't
// among them.
const SEASON_STAT_SHAPES = [
	"player_season_stat_over_under",
	"team_season_stat_over_under",
	"team_season_stat_numeric_guess",
	"player_vs_player_season",
	"team_vs_team_season",
	"player_season_stat_leader",
	"player_team_season_stat_leader",
] as const

const loadCandidates = (now: Date) =>
	loadDueCandidates(now, (due) =>
		db.query.questions.findMany({
			where: {
				resolutionMode: "system",
				gameId: { isNull: true },
				shape: { in: [...SEASON_STAT_SHAPES] },
				...due,
			},
			with: {
				season: true,
				league: true,
				stat: true,
				options: true,
				autoResolution: true,
			},
		}),
	)

type Candidate = Awaited<ReturnType<typeof loadCandidates>>[number]

const playerIdsOf = (question: Candidate) =>
	[question.subjectPlayerId, ...question.options.map((o) => o.playerId)].filter(
		(id): id is string => id !== null,
	)

const teamIdsOf = (question: Candidate) =>
	[question.subjectTeamId, ...question.options.map((o) => o.teamId)].filter(
		(id): id is string => id !== null,
	)

const autoResolveStatKeyOf = (question: Candidate, leagueSlug: string) =>
	autoResolveStatKeyFor({
		shape: question.shape,
		leagueSlug,
		statName: question.stat?.name,
		customStat: question.customStat,
		statAggregation: question.statAggregation,
	})

function extractorFor(
	question: Candidate,
	leagueSlug: string,
): SeasonExtractor | null {
	const key = autoResolveStatKeyOf(question, leagueSlug)
	const extractor = key ? EXTRACTORS[key] : null
	return extractor?.scope === "season" ? extractor : null
}

// player_team_season_stat_leader reads no ESPN season endpoint: ESPN's season
// totals don't split a traded player's year by team, so each athlete's total
// for the subject team is added up from the stored box scores of its
// regular-season games.
async function decideTeamSeasonLeaderQuestion(
	question: Candidate,
	leagueSlug: string,
): Promise<Decision> {
	const key = autoResolveStatKeyOf(question, leagueSlug)
	const extractor = key ? EXTRACTORS[key] : null
	const source =
		extractor?.scope === "game" && extractor.subject === "player"
			? extractor.source
			: undefined
	const teamId = question.subjectTeamId
	if (!source || !teamId) {
		return fail("unmapped", "this question's stat doesn't settle automatically")
	}

	const [totals, missing] = await Promise.all([
		db.execute<{
			source_athlete_id: string
			player_id: string | null
			total: string
		}>(sql`
			select s.source_athlete_id,
				(array_agg(s.player_id) filter (where s.player_id is not null))[1] as player_id,
				coalesce(sum(s.value_numeric), 0) as total
			from player_game_stats s
			join games g on g.id = s.game_id
			where s.team_id = ${teamId}
				and s.season_id = ${question.seasonId}
				and g.season_type = 'regular'
				and s.stat_key in ${source.keys}
			group by s.source_athlete_id
		`),
		db.execute<{ missing: string }>(sql`
			select count(*) as missing
			from games
			where season_id = ${question.seasonId}
				and season_type = 'regular'
				and status = 'final'
				and (home_team_id = ${teamId} or away_team_id = ${teamId})
				and box_score_synced_at is null
		`),
	])

	return decideTeamSeasonLeader({
		options: question.options,
		totals: totals.rows.map((row) => ({
			sourceAthleteId: row.source_athlete_id,
			playerId: row.player_id,
			value: Number(row.total),
		})),
		gamesMissingBoxScores: Number(missing.rows[0]?.missing ?? 0),
	})
}

// Reads one league season's standings and statistics, each once, then settles
// every question from them. Does nothing until the regular season is over.
async function processSeason(
	group: Candidate[],
	{ now, espn, requester }: AutoResolveRun,
): Promise<void> {
	const season = group[0]?.season
	const league = group[0]?.league
	if (!season || !league) return

	const unfinishedRegularGames = await db.query.games.findMany({
		where: {
			seasonId: season.id,
			seasonType: "regular",
			status: { ne: "final" },
		},
		columns: { status: true, startsAt: true },
	})
	if (!isSeasonResolutionDue(season, unfinishedRegularGames, now)) return

	const { apply, applyAll } = applierFor(group, {
		now,
		escalateAt: new Date(
			seasonSettlesAt(season).getTime() + SEASON_ESCALATE_AFTER_MS,
		),
		resolutionSource: autoResolutionSource("season"),
		...NOTES,
	})

	const config = SYNCED_LEAGUES.find((c) => c.leagueSlug === league.slug)
	if (!config) {
		await applyAll(
			fail("missing_external_ref", `${league.slug} isn't synced from ESPN`),
		)
		return
	}

	const planned = group.map((question) => ({
		question,
		extractor: extractorFor(question, league.slug),
	}))
	const needing = (need: SeasonSourceNeed) =>
		planned
			.filter((p) => p.extractor?.needs.includes(need))
			.map((p) => p.question)
	const [espnAthleteIdByPlayerId, espnTeamIdByTeamId] = await Promise.all([
		loadEspnIds("player", group.flatMap(playerIdsOf)),
		loadEspnIds("team", group.flatMap(teamIdsOf)),
	])
	const espnIds = (ids: string[], byId: Map<string, string>) =>
		new Set(ids.flatMap((id) => byId.get(id) ?? []))

	const sources: SeasonSources = {
		athleteStats: new Map(),
		teamStats: new Map(),
		winsByTeam: new Map(),
	}

	if (needing("standings").length > 0) {
		const standings = await requester.request(
			`${league.slug} standings ${season.year}`,
			() => espn.fetchStandings(config.espnPath, season.year),
		)
		sources.winsByTeam = standings ? parseStandingsWins(standings) : null
	}

	const teamIds = needing("teamStats").flatMap(teamIdsOf)
	for (const espnTeamId of espnIds(teamIds, espnTeamIdByTeamId)) {
		const stats = await requester.request(
			`${league.slug} team ${espnTeamId} season ${season.year}`,
			() =>
				espn.fetchTeamSeasonStatistics(
					config.espnPath,
					season.year,
					espnTeamId,
				),
		)
		if (stats) {
			sources.teamStats.set(espnTeamId, flattenCategorizedStatistics(stats))
		}
	}

	const playerIds = needing("athleteStats").flatMap(playerIdsOf)
	for (const espnAthleteId of espnIds(playerIds, espnAthleteIdByPlayerId)) {
		const stats = await requester.request(
			`${league.slug} athlete ${espnAthleteId} season ${season.year}`,
			async () => {
				// ESPN has no season at all for an athlete who never played in it.
				const found = await espn.fetchAthleteSeasonStatistics(
					config.espnPath,
					season.year,
					espnAthleteId,
				)
				return found
					? flattenCategorizedStatistics(found)
					: new Map<string, number>()
			},
		)
		if (stats) sources.athleteStats.set(espnAthleteId, stats)
	}

	const statsUrl = `https://www.espn.com/${league.slug}/stats/_/season/${season.year}/seasontype/2`
	const standingsUrl = `https://www.espn.com/${league.slug}/standings/_/season/${season.year}`
	for (const { question, extractor } of planned) {
		if (question.shape === "player_team_season_stat_leader") {
			await apply(
				question.id,
				await decideTeamSeasonLeaderQuestion(question, league.slug),
				statsUrl,
			)
			continue
		}
		const decision = extractor
			? decideSeasonQuestion({
					question,
					options: question.options,
					extractor,
					sources,
					espnAthleteIdByPlayerId,
					espnTeamIdByTeamId,
				})
			: fail("unmapped", "this question's stat doesn't settle automatically")
		await apply(
			question.id,
			decision,
			extractor?.needs.includes("standings") ? standingsUrl : statsUrl,
		)
	}
}

export function autoResolveSeasons(
	options: AutoResolveJobOptions = {},
): Promise<void> {
	return runAutoResolveJob(
		{
			name: "auto-resolve-seasons",
			unit: "season",
			loadCandidates,
			groupKey: (question) => question.seasonId,
			processGroup: processSeason,
		},
		options,
	)
}

runCli(import.meta.url, autoResolveSeasons, { lock: AUTO_RESOLVE_SEASONS_LOCK })
