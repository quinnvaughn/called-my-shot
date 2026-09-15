import {
	autoResolutionSource,
	resolutionModeFor,
} from "@called-my-shot/schemas"
import { LOSS_RATE_BY_SHAPE } from "@called-my-shot/scoring"
import { and, eq, notExists, sql } from "drizzle-orm"
import { match } from "ts-pattern"
import { buildPlayerPool } from "../../lib/award-pool"
import { loadBandSettings } from "../../lib/game-questions/band-settings"
import {
	generationKey,
	isInSlot,
	parseGenerationKey,
} from "../../lib/game-questions/generation-key"
import { loadLeaderLossSettings } from "../../lib/game-questions/leader-settings"
import { favoriteOf, type LeaderBasis } from "../../lib/game-questions/leaders"
import {
	loadLineSettings,
	withLineSettings,
} from "../../lib/game-questions/line-settings"
import {
	blendSamples,
	type LineBasis,
	needsPriorSeason,
	perGameSample,
	type SeasonSample,
	setLine,
} from "../../lib/game-questions/lines"
import {
	chooseFrom,
	eligibleStarters,
	rankCandidates,
	type StarterCandidate,
	type StarterPick,
	startersPosted,
} from "../../lib/game-questions/pick-subjects"
import { refreshGeneratedQuestionSchedule } from "../../lib/game-questions/schedule"
import { selectGameTemplates } from "../../lib/game-questions/select-templates"
import {
	type GameQuestionTitleFacts,
	gameQuestionTitle,
} from "../../lib/game-questions/titles"
import { isMainModule } from "../../lib/is-main-module"
import { numericToleranceFor } from "../../lib/numeric-tolerance"
import { getOfficialAccountId } from "../../lib/official-account"
import {
	activeGameTemplates,
	type GameQuestionTemplate,
	PLAYER_QUESTIONS_PER_GAME,
} from "../catalog/game-question-catalog"
import { db } from "../index"
import {
	calls,
	type Game,
	type League,
	type Player,
	questionOptions,
	questions,
	type Season,
	type Team,
} from "../schema"
import { fetchAthleteSeasonStatistics } from "./espn-client"
import {
	createEspnRequester,
	DEFAULT_ESPN_SPACING_MS,
	type EspnRequester,
} from "./espn-requester"
import { SYNCED_LEAGUES, type SyncLeagueConfig } from "./leagues"
import { flattenCategorizedStatistics } from "./season-stats-parse"

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// NBA and MLB questions go up about a day ahead of the game: late enough that
// starters are mostly known, early enough to be called over a whole day.
const DAILY_WINDOW_MS = 30 * HOUR_MS

// A game this close to starting gets nothing new and loses nothing: whatever
// is on it by now is what people are calling.
const MIN_LEAD_MS = 60 * MINUTE_MS

type GenerationWindow = { kind: "ahead"; ms: number } | { kind: "week" }

function windowFor(leagueSlug: string): GenerationWindow | null {
	return match(leagueSlug)
		.returnType<GenerationWindow | null>()
		.with("nba", "mlb", () => ({ kind: "ahead", ms: DAILY_WINDOW_MS }))
		.with("nfl", () => ({ kind: "week" }))
		.otherwise(() => null)
}

type WindowGame = Pick<
	Game,
	"startsAt" | "seasonId" | "seasonType" | "weekNumber"
>

// The upcoming games a window covers, soonest first. An NFL week is the one
// the next game belongs to, taken whole, so a week's questions all go up once
// the previous week's last game has kicked off. A game without a week number
// falls back to the seven days ahead.
export function gamesInWindow<G extends WindowGame>(
	upcoming: G[],
	window: GenerationWindow,
	now: Date,
): G[] {
	const msUntil = (game: G) => game.startsAt.getTime() - now.getTime()
	const sorted = upcoming
		.filter((game) => msUntil(game) > 0)
		.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())

	const covered = match(window)
		.with({ kind: "ahead" }, ({ ms }) =>
			sorted.filter((game) => msUntil(game) <= ms),
		)
		.with({ kind: "week" }, () => {
			const next = sorted[0]
			if (!next) return []
			if (next.weekNumber === null) {
				return sorted.filter((game) => msUntil(game) <= 7 * DAY_MS)
			}
			return sorted.filter(
				(game) =>
					game.seasonId === next.seasonId &&
					game.seasonType === next.seasonType &&
					game.weekNumber === next.weekNumber,
			)
		})
		.exhaustive()

	return covered.filter((game) => msUntil(game) >= MIN_LEAD_MS)
}

type DueGame = Game & { homeTeam: Team; awayTeam: Team; season: Season }

type CatalogStat = NonNullable<
	Awaited<ReturnType<typeof loadCatalogStats>>
>[number]

// Stands in for the catalog, per league slug: tests pin the exact templates a
// run posts rather than depending on which ones a game draws.
export type CatalogOverride = {
	templates?: Record<string, GameQuestionTemplate[]>
	playerQuestionsPerGame?: Record<string, number>
}

type LeagueContext = {
	config: SyncLeagueConfig
	league: League
	officialAccountId: string
	templates: GameQuestionTemplate[]
	// How many player templates each game draws - see PLAYER_QUESTIONS_PER_GAME.
	perGame: number
	statsByName: Map<string, CatalogStat>
	// The league's saved team numeric guess bands - see loadBandSettings.
	bandsByStatName: Map<string, number>
	// The league's saved game stat leader loss rates - see
	// loadLeaderLossSettings.
	leaderLossByStatName: Map<string, number>
	starters: (StarterCandidate & { gameId: string })[]
	// Each due team's current roster, loaded only when a template picks from
	// rosters.
	rostersByTeamId: Map<string, Player[]>
	playerNameById: Map<string, string>
	espnAthleteIdByPlayerId: Map<string, string>
	seasonStatsFor: (
		espnAthleteId: string,
		year: number,
	) => Promise<Map<string, number> | null>
}

type PlannedQuestion = {
	key: string
	title: GameQuestionTitleFacts
	subjectTeamId?: string
	subjectPlayerId?: string
	ouLine?: number
	lineBasis?: LineBasis
	leaderBasis?: LeaderBasis
	options: { label: string; sortOrder: number; playerId?: string }[]
}

type Samples = { season: SeasonSample | null; prior: SeasonSample | null }

const espnIdOf = (sourceId: string) => sourceId.split(":")[1] ?? sourceId

function loadCatalogStats(sportId: string, names: string[]) {
	return db.query.stats.findMany({
		where: { sportId, name: { in: names } },
		with: { toleranceTier: true, teamToleranceTier: true },
	})
}

// One fetch per athlete and season per run, however many templates or games
// ask for it. A failed or missing read is null, the same as no season at all.
function createSeasonStatsCache(
	config: SyncLeagueConfig,
	requester: EspnRequester,
) {
	const cache = new Map<string, Map<string, number> | null>()
	return async (espnAthleteId: string, year: number) => {
		const key = `${espnAthleteId}:${year}`
		if (cache.has(key)) return cache.get(key) ?? null
		const statistics = await requester.request(
			`${config.leagueSlug} athlete ${espnAthleteId} season ${year}`,
			() => fetchAthleteSeasonStatistics(config.espnPath, year, espnAthleteId),
		)
		const flattened = statistics
			? flattenCategorizedStatistics(statistics)
			: null
		cache.set(key, flattened)
		return flattened
	}
}

// Templates whose questions would settle from ESPN on their own. Anything that
// wouldn't is left out, so no generated question ever needs a person to grade
// it.
function systemTemplates(
	leagueSlug: string,
	templates: GameQuestionTemplate[],
	statsByName: Map<string, CatalogStat>,
): GameQuestionTemplate[] {
	return templates.filter((template) => {
		const stat = statsByName.get(template.statName)
		const settles =
			stat !== undefined &&
			resolutionModeFor({
				shape: template.shape,
				leagueSlug,
				statName: template.statName,
			}) === "system" &&
			(template.shape !== "team_stat_numeric_guess" || !!stat.toleranceTier)
		if (!settles) {
			console.error(
				`[generate-game-questions] ${leagueSlug} template ${template.id} skipped: "${template.statName}" can't settle automatically`,
			)
		}
		return settles
	})
}

async function samplesFor(
	ctx: LeagueContext,
	playerId: string,
	pick: StarterPick,
	year: number,
): Promise<Samples> {
	const espnAthleteId = ctx.espnAthleteIdByPlayerId.get(playerId)
	if (!espnAthleteId) return { season: null, prior: null }
	const current = await ctx.seasonStatsFor(espnAthleteId, year)
	const season = current
		? perGameSample(current, pick.espnStat, pick.espnGames)
		: null
	if (!needsPriorSeason(season, pick.priorWeight)) {
		return { season, prior: null }
	}
	const previous = await ctx.seasonStatsFor(espnAthleteId, year - 1)
	return {
		season,
		prior: previous
			? perGameSample(previous, pick.espnStat, pick.espnGames)
			: null,
	}
}

// A team's roster players at the pick's positions, shaped like starters in the
// pick's role.
function rosterCandidates(
	ctx: LeagueContext,
	teamId: string,
	pick: StarterPick,
): StarterCandidate[] {
	return (ctx.rostersByTeamId.get(teamId) ?? [])
		.filter(
			(player) =>
				!pick.positions ||
				player.positions.some((position) =>
					pick.positions?.includes(position),
				),
		)
		.map((player, index) => ({
			playerId: player.id,
			teamId,
			role: pick.role,
			position: player.position,
			sortOrder: index + 1,
			injuryStatus: null,
		}))
}

// A team's starters the pick can come from, best per-game average first, each
// with the samples that ranking was made from. A roster pick takes the roster
// until ESPN lists the team's starters in its role.
async function rankedStarters(
	ctx: LeagueContext,
	game: DueGame,
	teamId: string,
	pick: StarterPick,
): Promise<{ candidate: StarterCandidate; samples: Samples }[]> {
	const gameStarters = ctx.starters.filter((s) => s.gameId === game.id)
	const candidates =
		pick.source === "roster" &&
		!startersPosted(gameStarters, teamId, pick.role)
			? rosterCandidates(ctx, teamId, pick)
			: eligibleStarters(gameStarters, teamId, pick)
	const eligible = candidates.filter((candidate) =>
		ctx.playerNameById.has(candidate.playerId),
	)
	const samplesByPlayerId = new Map<string, Samples>()
	for (const candidate of eligible) {
		samplesByPlayerId.set(
			candidate.playerId,
			await samplesFor(ctx, candidate.playerId, pick, game.season.year),
		)
	}
	const samplesOf = (candidate: StarterCandidate): Samples =>
		samplesByPlayerId.get(candidate.playerId) ?? { season: null, prior: null }
	return rankCandidates(eligible, (candidate) => {
		const { season, prior } = samplesOf(candidate)
		return blendSamples(season, prior, pick.priorWeight)?.mean ?? null
	}).map((candidate) => ({ candidate, samples: samplesOf(candidate) }))
}

// Ruled out once ESPN lists the team's starters in the pick's role without
// this player among the ones who can play.
function isRuledOut(
	starters: StarterCandidate[],
	teamId: string,
	playerId: string,
	pick: StarterPick,
): boolean {
	return (
		startersPosted(starters, teamId, pick.role) &&
		!eligibleStarters(starters, teamId, pick).some(
			(starter) => starter.playerId === playerId,
		)
	)
}

// Whether an existing question is about a player who's no longer starting.
// Team guesses and leader questions aren't about one player, so they never
// are.
function isStale(
	template: GameQuestionTemplate,
	keyRest: string[],
	starters: StarterCandidate[],
	game: DueGame,
): boolean {
	return match(template)
		.with({ shape: "player_stat_over_under" }, ({ pick }) => {
			const [teamId, playerId] = keyRest
			return !!teamId && !!playerId && isRuledOut(starters, teamId, playerId, pick)
		})
		.with({ shape: "player_vs_player" }, ({ pick }) => {
			const [awayPlayerId, homePlayerId] = keyRest
			return (
				(!!awayPlayerId &&
					isRuledOut(starters, game.awayTeamId, awayPlayerId, pick)) ||
				(!!homePlayerId &&
					isRuledOut(starters, game.homeTeamId, homePlayerId, pick))
			)
		})
		.with(
			{ shape: "team_stat_numeric_guess" },
			{ shape: "player_game_stat_leader" },
			() => false,
		)
		.exhaustive()
}

// The players a generated question is about, read off the rest of its key.
// A leader question's options are whole rosters, so it isn't about anyone in
// particular.
function subjectPlayerIds(
	template: GameQuestionTemplate,
	keyRest: string[],
): string[] {
	return match(template)
		.returnType<string[]>()
		.with({ shape: "player_vs_player" }, () => keyRest.slice(0, 2))
		.with({ shape: "player_stat_over_under" }, () => keyRest.slice(1, 2))
		.with(
			{ shape: "team_stat_numeric_guess" },
			{ shape: "player_game_stat_leader" },
			() => [],
		)
		.exhaustive()
}

// Only while nobody has called it: a question someone already called stays
// up, and auto-resolution voids it if the player doesn't play.
async function deleteIfUncalled(questionId: string): Promise<boolean> {
	const deleted = await db
		.delete(questions)
		.where(
			and(
				eq(questions.id, questionId),
				eq(questions.status, "open"),
				notExists(
					db
						.select({ one: sql`1` })
						.from(calls)
						.where(eq(calls.questionId, questions.id)),
				),
			),
		)
		.returning({ id: questions.id })
	return deleted.length > 0
}

async function planTemplate(
	ctx: LeagueContext,
	game: DueGame,
	template: GameQuestionTemplate,
	isFilled: (slot: string) => boolean,
	isClaimed: (statName: string, playerId: string) => boolean,
): Promise<PlannedQuestion[]> {
	const base = [ctx.league.slug, game.id, template.id]
	const teams = [game.awayTeam, game.homeTeam]
	const nameOf = (playerId: string) => ctx.playerNameById.get(playerId) ?? ""

	return match(template)
		.returnType<Promise<PlannedQuestion[]>>()
		.with({ shape: "team_stat_numeric_guess" }, async ({ statName }) =>
			teams.flatMap((team) => {
				const key = generationKey([...base, team.id])
				if (isFilled(key)) return []
				return [
					{
						key,
						title: {
							shape: "team_stat_numeric_guess",
							statName,
							teamId: team.id,
						},
						subjectTeamId: team.id,
						options: [],
					},
				]
			}),
		)
		.with({ shape: "player_game_stat_leader" }, async ({ statName, pick }) => {
			const key = generationKey(base)
			if (isFilled(key)) return []
			const pool = await buildPlayerPool({
				teamIds: [game.awayTeamId, game.homeTeamId],
			})
			if (pool.length < 2) return []
			// Only a favorite who's one of the options can be checked against
			// who actually led.
			const inPool = new Set(pool.map((player) => player.id))
			const contenders = [
				...(await rankedStarters(ctx, game, game.awayTeamId, pick)),
				...(await rankedStarters(ctx, game, game.homeTeamId, pick)),
			].flatMap(({ candidate, samples }) =>
				inPool.has(candidate.playerId)
					? [
							{
								playerId: candidate.playerId,
								mean:
									blendSamples(samples.season, samples.prior, pick.priorWeight)
										?.mean ?? null,
							},
						]
					: [],
			)
			return [
				{
					key,
					title: { shape: "player_game_stat_leader", statName },
					leaderBasis: favoriteOf(contenders) ?? undefined,
					options: pool.map((player, index) => ({
						label: player.name,
						sortOrder: index,
						playerId: player.id,
					})),
				},
			]
		})
		.with({ shape: "player_vs_player" }, async ({ statName, pick }) => {
			if (isFilled(generationKey(base))) return []
			// Drawn from each side's best starters that nothing on the game
			// already asks about in this stat.
			const pickSide = async (teamId: string) =>
				chooseFrom(
					(await rankedStarters(ctx, game, teamId, pick)).filter(
						({ candidate }) => !isClaimed(statName, candidate.playerId),
					),
					pick.choose,
					generationKey([...base, teamId]),
				)
			const away = await pickSide(game.awayTeamId)
			const home = await pickSide(game.homeTeamId)
			if (!away || !home) return []
			const awayId = away.candidate.playerId
			const homeId = home.candidate.playerId
			return [
				{
					key: generationKey([...base, awayId, homeId]),
					title: {
						shape: "player_vs_player",
						statName,
						playerNames: [nameOf(awayId), nameOf(homeId)],
					},
					options: [
						{ label: nameOf(awayId), sortOrder: 0, playerId: awayId },
						{ label: nameOf(homeId), sortOrder: 1, playerId: homeId },
					],
				},
			]
		})
		.with(
			{ shape: "player_stat_over_under" },
			async ({ statName, pick, line }) => {
				const planned: PlannedQuestion[] = []
				for (const team of teams) {
					const slot = generationKey([...base, team.id])
					if (isFilled(slot)) continue
					// Drawn from the best starters whose season can carry a line and
					// that nothing on the game already asks about in this stat. One
					// without enough games falls through to the next.
					const lined = (
						await rankedStarters(ctx, game, team.id, pick)
					).flatMap(({ candidate, samples }) => {
						if (isClaimed(statName, candidate.playerId)) return []
						const basis = setLine(
							samples.season,
							samples.prior,
							pick.priorWeight,
							line,
						)
						return basis ? [{ candidate, basis }] : []
					})
					const chosen = chooseFrom(lined, pick.choose, slot)
					if (!chosen) continue
					const { candidate, basis } = chosen
					planned.push({
						key: generationKey([slot, candidate.playerId]),
						title: {
							shape: "player_stat_over_under",
							statName,
							playerName: nameOf(candidate.playerId),
							ouLine: basis.line,
						},
						subjectPlayerId: candidate.playerId,
						ouLine: basis.line,
						lineBasis: basis,
						options: [
							{ label: "Over", sortOrder: 0 },
							{ label: "Under", sortOrder: 1 },
						],
					})
				}
				return planned
			},
		)
		.exhaustive()
}

// Returns whether a question was actually inserted - a key that already
// exists is left alone.
async function insertPlanned(
	ctx: LeagueContext,
	game: DueGame,
	template: GameQuestionTemplate,
	planned: PlannedQuestion,
): Promise<boolean> {
	const stat = ctx.statsByName.get(template.statName)
	if (!stat) return false
	const tolerance =
		template.shape === "team_stat_numeric_guess"
			? numericToleranceFor(
					template.shape,
					stat,
					ctx.bandsByStatName.get(template.statName),
				)
			: null

	return db.transaction(async (tx) => {
		const [inserted] = await tx
			.insert(questions)
			.values({
				shape: template.shape,
				title: gameQuestionTitle(planned.title, game),
				creatorId: ctx.officialAccountId,
				isOfficial: true,
				sportId: ctx.league.sportId,
				leagueId: ctx.league.id,
				gameId: game.id,
				seasonId: game.seasonId,
				resolutionMode: "system",
				resolutionSource: autoResolutionSource("game"),
				locksAt: game.startsAt,
				statId: stat.id,
				ouLine: planned.ouLine ?? null,
				subjectTeamId: planned.subjectTeamId ?? null,
				subjectPlayerId: planned.subjectPlayerId ?? null,
				numericTolerancePct: tolerance?.numericTolerancePct ?? null,
				numericToleranceAbsolute: tolerance?.numericToleranceAbsolute ?? null,
				generationKey: planned.key,
				lineBasis: planned.lineBasis ?? null,
				leaderBasis: planned.leaderBasis ?? null,
				lossRate:
					template.shape === "player_game_stat_leader"
						? (ctx.leaderLossByStatName.get(template.statName) ??
							LOSS_RATE_BY_SHAPE.player_game_stat_leader)
						: null,
			})
			.onConflictDoNothing({ target: questions.generationKey })
			.returning({ id: questions.id })
		if (!inserted) return false

		if (planned.options.length > 0) {
			await tx.insert(questionOptions).values(
				planned.options.map((option) => ({
					questionId: inserted.id,
					label: option.label,
					sortOrder: option.sortOrder,
					playerId: option.playerId ?? null,
				})),
			)
		}
		return true
	})
}

async function generateForGame(
	ctx: LeagueContext,
	game: DueGame,
): Promise<{ created: number; removed: number }> {
	await db.transaction((tx) => refreshGeneratedQuestionSchedule(tx, game))

	const starters = ctx.starters.filter((s) => s.gameId === game.id)
	const existing = await db.query.questions.findMany({
		where: { gameId: game.id, generationKey: { isNotNull: true } },
		columns: { id: true, generationKey: true, status: true },
	})
	const templateById = new Map(
		ctx.templates.map((template) => [template.id, template]),
	)

	// A slot is filled by any question in it that isn't about a ruled-out
	// starter. One that is gets taken down if nobody has called it yet; either
	// way its slot opens for whoever is starting now.
	const liveKeys: string[] = []
	let removed = 0
	for (const question of existing) {
		const key = question.generationKey
		if (!key) continue
		const parsed = parseGenerationKey(key)
		const template = parsed ? templateById.get(parsed.templateId) : undefined
		if (
			parsed &&
			template &&
			question.status === "open" &&
			isStale(template, parsed.rest, starters, game)
		) {
			if (await deleteIfUncalled(question.id)) removed++
			continue
		}
		liveKeys.push(key)
	}
	const isFilled = (slot: string) => liveKeys.some((key) => isInSlot(key, slot))

	// A player is asked about each stat at most once per game: whoever a live
	// or just-planned question is about can't be the subject of another one on
	// the same stat.
	const claimed = new Set<string>()
	const claim = (template: GameQuestionTemplate, key: string) => {
		const parsed = parseGenerationKey(key)
		if (!parsed) return
		for (const playerId of subjectPlayerIds(template, parsed.rest)) {
			claimed.add(`${template.statName}:${playerId}`)
		}
	}
	const liveTemplateIds = new Set<string>()
	for (const key of liveKeys) {
		const parsed = parseGenerationKey(key)
		const template = parsed ? templateById.get(parsed.templateId) : undefined
		if (!template) continue
		liveTemplateIds.add(template.id)
		claim(template, key)
	}
	const isClaimed = (statName: string, playerId: string) =>
		claimed.has(`${statName}:${playerId}`)

	const selected = selectGameTemplates(ctx.templates, {
		gameId: game.id,
		perGame: ctx.perGame,
		liveTemplateIds,
	})

	let created = 0
	for (const template of selected) {
		for (const planned of await planTemplate(
			ctx,
			game,
			template,
			isFilled,
			isClaimed,
		)) {
			claim(template, planned.key)
			if (await insertPlanned(ctx, game, template, planned)) created++
		}
	}
	return { created, removed }
}

async function generateForLeague(
	config: SyncLeagueConfig,
	now: Date,
	requester: EspnRequester,
	officialAccountId: string,
	catalog: CatalogOverride,
): Promise<{ games: number; created: number; removed: number }> {
	const none = { games: 0, created: 0, removed: 0 }
	const window = windowFor(config.leagueSlug)
	const catalogTemplates =
		catalog.templates?.[config.leagueSlug] ??
		activeGameTemplates(config.leagueSlug)
	if (!window || catalogTemplates.length === 0) return none

	const league = await db.query.leagues.findFirst({
		where: { slug: config.leagueSlug },
	})
	if (!league) return none

	const upcoming = await db.query.games.findMany({
		where: { leagueId: league.id, status: "scheduled", startsAt: { gt: now } },
		with: { homeTeam: true, awayTeam: true, season: true },
	})
	const due = gamesInWindow(upcoming, window, now).map((game) => {
		if (!game.homeTeam || !game.awayTeam || !game.season) {
			throw new Error(
				`generateGameQuestions: game ${game.id} is missing its teams or season`,
			)
		}
		return {
			...game,
			homeTeam: game.homeTeam,
			awayTeam: game.awayTeam,
			season: game.season,
		}
	})
	if (due.length === 0) return none

	const statRows = await loadCatalogStats(league.sportId, [
		...new Set(catalogTemplates.map((template) => template.statName)),
	])
	const statsByName = new Map(statRows.map((stat) => [stat.name, stat]))
	const templates = withLineSettings(
		systemTemplates(league.slug, catalogTemplates, statsByName),
		await loadLineSettings(league.slug),
	)

	const starterRows = await db.query.gameStarters.findMany({
		where: {
			gameId: { in: due.map((game) => game.id) },
			playerId: { isNotNull: true },
		},
	})
	const starters = starterRows.flatMap((row) =>
		row.playerId
			? [
					{
						gameId: row.gameId,
						playerId: row.playerId,
						teamId: row.teamId,
						role: row.role,
						position: row.position,
						sortOrder: row.sortOrder,
						injuryStatus: row.injuryStatus,
					},
				]
			: [],
	)

	const picksFromRosters = templates.some(
		(template) => "pick" in template && template.pick.source === "roster",
	)
	const rosterPlayers = picksFromRosters
		? await db.query.players.findMany({
				where: {
					currentTeamId: {
						in: [
							...new Set(
								due.flatMap((game) => [game.awayTeamId, game.homeTeamId]),
							),
						],
					},
				},
				orderBy: { name: "asc" },
			})
		: []
	const rostersByTeamId = new Map<string, Player[]>()
	for (const player of rosterPlayers) {
		if (!player.currentTeamId) continue
		rostersByTeamId.set(player.currentTeamId, [
			...(rostersByTeamId.get(player.currentTeamId) ?? []),
			player,
		])
	}

	const playerIds = [
		...new Set([
			...starters.map((starter) => starter.playerId),
			...rosterPlayers.map((player) => player.id),
		]),
	]
	const [players, playerRefs] =
		playerIds.length > 0
			? await Promise.all([
					db.query.players.findMany({ where: { id: { in: playerIds } } }),
					db.query.externalRefs.findMany({
						where: {
							source: "espn",
							entityType: "player",
							entityId: { in: playerIds },
						},
					}),
				])
			: [[], []]

	const ctx: LeagueContext = {
		config,
		league,
		officialAccountId,
		templates,
		perGame:
			catalog.playerQuestionsPerGame?.[league.slug] ??
			PLAYER_QUESTIONS_PER_GAME[league.slug] ??
			0,
		statsByName,
		bandsByStatName: await loadBandSettings(league.slug),
		leaderLossByStatName: await loadLeaderLossSettings(league.slug),
		starters,
		rostersByTeamId,
		playerNameById: new Map(players.map((player) => [player.id, player.name])),
		espnAthleteIdByPlayerId: new Map(
			playerRefs.map((ref) => [ref.entityId, espnIdOf(ref.sourceId)]),
		),
		seasonStatsFor: createSeasonStatsCache(config, requester),
	}

	let created = 0
	let removed = 0
	for (const game of due) {
		const result = await generateForGame(ctx, game)
		created += result.created
		removed += result.removed
	}
	return { games: due.length, created, removed }
}

// Posts each league's catalog questions (db/catalog/game-question-catalog.ts)
// on the games in its window. Idempotent: a question already posted, or a slot
// already holding one, is left alone, so most runs insert nothing.
export async function generateGameQuestions({
	now = new Date(),
	spacingMs = DEFAULT_ESPN_SPACING_MS,
	catalog = {},
}: {
	now?: Date
	spacingMs?: number
	catalog?: CatalogOverride
} = {}): Promise<void> {
	const officialAccountId = await getOfficialAccountId()
	const requester = createEspnRequester("generate-game-questions", spacingMs)

	for (const config of SYNCED_LEAGUES) {
		const { games, created, removed } = await generateForLeague(
			config,
			now,
			requester,
			officialAccountId,
			catalog,
		)
		if (games === 0) continue
		console.log(
			`[generate-game-questions] ${config.leagueSlug}: ${created} created, ${removed} removed across ${games} game(s)`,
		)
	}

	console.log(
		`[generate-game-questions] done, ${requester.count()} ESPN request(s)`,
	)
}

if (isMainModule(import.meta.url)) {
	generateGameQuestions()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
}
