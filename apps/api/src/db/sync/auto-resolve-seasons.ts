import {
	autoResolutionSource,
	autoResolveStatKeyFor,
} from "@called-my-shot/schemas"
import {
	type ApplyContext,
	applyDecision,
	autoVoidedNote,
	isAttemptDue,
} from "../../lib/auto-resolve/apply"
import { fail } from "../../lib/auto-resolve/decide"
import {
	EXTRACTORS,
	type SeasonExtractor,
	type SeasonSourceNeed,
	type SeasonSources,
} from "../../lib/auto-resolve/registry"
import { decideSeasonQuestion } from "../../lib/auto-resolve/season-decide"
import {
	isSeasonResolutionDue,
	seasonSettlesAt,
} from "../../lib/auto-resolve/season-due"
import { isMainModule } from "../../lib/is-main-module"
import { db } from "../index"
import {
	EspnRequestError,
	fetchAthleteSeasonStatistics,
	fetchStandings,
	fetchTeamSeasonStatistics,
} from "./espn-client"
import {
	createEspnRequester,
	DEFAULT_ESPN_SPACING_MS,
	type EspnRequester,
} from "./espn-requester"
import { SYNCED_LEAGUES } from "./leagues"
import {
	flattenCategorizedStatistics,
	parseStandingsWins,
} from "./season-stats-parse"

const HOUR_MS = 60 * 60 * 1000

// How long past the season settling a retryable failure keeps being retried
// before the question is handed to an admin. The job runs daily, so this is
// two more tries.
export const SEASON_ESCALATE_AFTER_MS = 48 * HOUR_MS

const RESOLVED_NOTE = "Resolved automatically from ESPN's regular-season stats."
const voidedNoteFor = autoVoidedNote("ESPN's regular-season stats")

// The season-long shapes a stat settles. Awards and championships aren't
// among them.
const SEASON_STAT_SHAPES = [
	"player_season_stat_over_under",
	"team_season_stat_over_under",
	"team_season_stat_numeric_guess",
	"player_vs_player_season",
	"team_vs_team_season",
	"player_season_stat_leader",
] as const

const CANDIDATE_RELATIONS = {
	season: true,
	league: true,
	stat: true,
	options: true,
	autoResolution: true,
} as const

async function loadCandidates(now: Date) {
	const seasonQuestion = {
		resolutionMode: "system" as const,
		gameId: { isNull: true as const },
		shape: { in: [...SEASON_STAT_SHAPES] },
	}
	const [unsettled, awaitingRecheck] = await Promise.all([
		db.query.questions.findMany({
			where: {
				...seasonQuestion,
				status: { in: ["open", "locked"] },
				locksAt: { lte: now },
			},
			with: CANDIDATE_RELATIONS,
		}),
		db.query.questions.findMany({
			where: {
				...seasonQuestion,
				resolutionMethod: "system",
				status: { in: ["resolved", "voided"] },
				autoResolution: {
					recheckDueAt: { lte: now },
					recheckedAt: { isNull: true },
				},
			},
			with: CANDIDATE_RELATIONS,
		}),
	])

	return [...unsettled, ...awaitingRecheck].filter((question) =>
		isAttemptDue(question, now),
	)
}

type Candidate = Awaited<ReturnType<typeof loadCandidates>>[number]

const playerIdsOf = (question: Candidate) =>
	[question.subjectPlayerId, ...question.options.map((o) => o.playerId)].filter(
		(id): id is string => id !== null,
	)

const teamIdsOf = (question: Candidate) =>
	[question.subjectTeamId, ...question.options.map((o) => o.teamId)].filter(
		(id): id is string => id !== null,
	)

const espnIdOf = (sourceId: string) => sourceId.split(":")[1] ?? sourceId

async function loadEspnRefs(group: Candidate[]) {
	const load = async (entityType: "player" | "team", ids: string[]) => {
		const unique = [...new Set(ids)]
		if (unique.length === 0) return new Map<string, string>()
		const refs = await db.query.externalRefs.findMany({
			where: { source: "espn", entityType, entityId: { in: unique } },
		})
		return new Map(refs.map((ref) => [ref.entityId, espnIdOf(ref.sourceId)]))
	}
	const [espnAthleteIdByPlayerId, espnTeamIdByTeamId] = await Promise.all([
		load("player", group.flatMap(playerIdsOf)),
		load("team", group.flatMap(teamIdsOf)),
	])
	return { espnAthleteIdByPlayerId, espnTeamIdByTeamId }
}

function extractorFor(
	question: Candidate,
	leagueSlug: string,
): SeasonExtractor | null {
	const key = autoResolveStatKeyFor({
		shape: question.shape,
		leagueSlug,
		statName: question.stat?.name,
		customStat: question.customStat,
		statAggregation: question.statAggregation,
	})
	const extractor = key ? EXTRACTORS[key] : null
	return extractor?.scope === "season" ? extractor : null
}

// Reads one league season's standings and statistics, each once, then settles
// every question from them. Does nothing until the regular season is over.
async function processSeason(
	group: Candidate[],
	requester: EspnRequester,
	now: Date,
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

	const contextFor = (resolutionSourceUrl: string | null): ApplyContext => ({
		now,
		escalateAt: new Date(
			seasonSettlesAt(season).getTime() + SEASON_ESCALATE_AFTER_MS,
		),
		resolutionSource: autoResolutionSource("season"),
		resolutionSourceUrl,
		resolvedNote: RESOLVED_NOTE,
		voidedNote: voidedNoteFor,
	})

	const config = SYNCED_LEAGUES.find((c) => c.leagueSlug === league.slug)
	if (!config) {
		for (const question of group) {
			await applyDecision(
				question.id,
				fail("missing_external_ref", `${league.slug} isn't synced from ESPN`),
				contextFor(null),
			)
		}
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
	const refs = await loadEspnRefs(group)
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
			() => fetchStandings(config.espnPath, season.year),
		)
		sources.winsByTeam = standings ? parseStandingsWins(standings) : null
	}

	const teamIds = needing("teamStats").flatMap(teamIdsOf)
	for (const espnTeamId of espnIds(teamIds, refs.espnTeamIdByTeamId)) {
		const stats = await requester.request(
			`${league.slug} team ${espnTeamId} season ${season.year}`,
			() => fetchTeamSeasonStatistics(config.espnPath, season.year, espnTeamId),
		)
		if (stats) {
			sources.teamStats.set(espnTeamId, flattenCategorizedStatistics(stats))
		}
	}

	const playerIds = needing("athleteStats").flatMap(playerIdsOf)
	for (const espnAthleteId of espnIds(
		playerIds,
		refs.espnAthleteIdByPlayerId,
	)) {
		const stats = await requester.request(
			`${league.slug} athlete ${espnAthleteId} season ${season.year}`,
			async () => {
				// ESPN has no season at all for an athlete who never played in it.
				const found = await fetchAthleteSeasonStatistics(
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
		const decision = extractor
			? decideSeasonQuestion({
					question,
					options: question.options,
					extractor,
					sources,
					espnAthleteIdByPlayerId: refs.espnAthleteIdByPlayerId,
					espnTeamIdByTeamId: refs.espnTeamIdByTeamId,
				})
			: fail("unmapped", "this question's stat doesn't settle automatically")
		await applyDecision(
			question.id,
			decision,
			contextFor(
				extractor?.needs.includes("standings") ? standingsUrl : statsUrl,
			),
		)
	}
}

export async function autoResolveSeasons({
	now = new Date(),
	spacingMs = DEFAULT_ESPN_SPACING_MS,
}: {
	now?: Date
	spacingMs?: number
} = {}): Promise<void> {
	const candidates = await loadCandidates(now)
	if (candidates.length === 0) {
		console.log("[auto-resolve-seasons] nothing due")
		return
	}

	const bySeason = new Map<string, Candidate[]>()
	for (const question of candidates) {
		if (!question.seasonId) continue
		bySeason.set(question.seasonId, [
			...(bySeason.get(question.seasonId) ?? []),
			question,
		])
	}

	const requester = createEspnRequester("auto-resolve-seasons", spacingMs)
	for (const [seasonId, group] of bySeason) {
		try {
			await processSeason(group, requester, now)
		} catch (err) {
			// ESPN refusing us ends the run; anything else is one season's problem.
			if (err instanceof EspnRequestError) throw err
			console.error(`[auto-resolve-seasons] season ${seasonId} failed:`, err)
		}
	}

	console.log(
		`[auto-resolve-seasons] ${candidates.length} question(s) across ${bySeason.size} season(s), ${requester.count()} ESPN request(s)`,
	)
}

if (isMainModule(import.meta.url)) {
	autoResolveSeasons()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
}
