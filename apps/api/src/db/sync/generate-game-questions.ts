import { autoResolutionSource, canLeadStat } from "@called-my-shot/schemas"
import { defaultLossRate } from "@called-my-shot/scoring"
import { and, eq, notExists, sql } from "drizzle-orm"
import { match } from "ts-pattern"
import { buildPlayerPool } from "../../lib/award-pool"
import { loadBandSettings } from "../../lib/game-questions/band-settings"
import {
	BOX_PRIOR_GAMES,
	playerBoxSpread,
} from "../../lib/game-questions/box-spread"
import {
	type DuelSpread,
	duelSpreadFor,
	type PricedSide,
	playerLineTemplateFor,
	priceDuel,
	withBoxSpread,
} from "../../lib/game-questions/duel-pricing"
import {
	generationKey,
	isInSlot,
	parseGenerationKey,
} from "../../lib/game-questions/generation-key"
import { loadLeaderLossSettings } from "../../lib/game-questions/leader-settings"
import { priceLeaderPool } from "../../lib/game-questions/leader-pricing"
import { favoriteOf, type LeaderBasis } from "../../lib/game-questions/leaders"
import {
	loadLineSettings,
	withLineSettings,
} from "../../lib/game-questions/line-settings"
import {
	blendSamples,
	LINE_FORMULA,
	type LineBasis,
	type OpponentAdjustment,
	setLine,
	setTotalLine,
} from "../../lib/game-questions/lines"
import {
	chooseFrom,
	eligibleStarters,
	isPlayable,
	rankCandidates,
	type StarterCandidate,
	type StarterPick,
	startersPosted,
} from "../../lib/game-questions/pick-subjects"
import {
	gamesInWindow,
	isStale,
	rosterCandidates,
	subjectPlayerIds,
	systemTemplates,
	windowFor,
} from "../../lib/game-questions/plan"
import {
	createSeasonStatsCache,
	type EspnAccess,
	playerSamples,
	type Samples,
	type SeasonStatsFor,
} from "../../lib/game-questions/player-samples"
import { repriceUncalled } from "../../lib/game-questions/reprice"
import { refreshGeneratedQuestionSchedule } from "../../lib/game-questions/schedule"
import { selectGameTemplates } from "../../lib/game-questions/select-templates"
import {
	createSeasonTableCache,
	createStandingsCache,
	createTeamSeasonStatsCache,
	type OpponentDeps,
	opponentFor,
	teamSamples,
	teamScoresFrom,
} from "../../lib/game-questions/team-lines"
import {
	type GameQuestionTitleFacts,
	gameQuestionTitle,
} from "../../lib/game-questions/titles"
import { GENERATE_GAME_QUESTIONS_LOCK } from "../../lib/job-lock"
import { numericToleranceFor } from "../../lib/numeric-tolerance"
import { getOfficialAccountId } from "../../lib/official-account"
import { isGameAskable } from "../../lib/postseason/settle"
import { runCli } from "../../lib/run-cli"
import {
	GENERATED_DUEL_MIN_RATIO,
	shareOfLeader,
} from "../../lib/mismatch"
import {
	activeGameTemplates,
	GAME_QUESTION_CATALOG,
	type GameQuestionTemplate,
	PLAYER_QUESTIONS_PER_GAME,
	RETIRED_GAME_TEMPLATE_IDS,
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
import { defaultEspnClient, type EspnClient } from "./espn-client"
import { createEspnRequester, DEFAULT_ESPN_SPACING_MS } from "./espn-requester"
import { SYNCED_LEAGUES, type SyncLeagueConfig } from "./leagues"
import { loadEspnIds } from "./sync-refs"

type DueGame = Game & { homeTeam: Team; awayTeam: Team; season: Season }

type CatalogStat = NonNullable<
	Awaited<ReturnType<typeof loadCatalogStats>>
>[number]

// Stands in for the catalog, per league slug: tests pin the exact templates a
// run posts rather than depending on which ones a game draws.
export type CatalogOverride = {
	templates?: Record<string, GameQuestionTemplate[]>
	playerQuestionsPerGame?: Record<string, number>
	retiredTemplateIds?: Record<string, string[]>
}

type LeagueContext = {
	config: SyncLeagueConfig
	league: League
	officialAccountId: string
	templates: GameQuestionTemplate[]
	// See RETIRED_GAME_TEMPLATE_IDS.
	retiredTemplateIds: Set<string>
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
	// Players the roster currently says can't play. Read when tearing down a
	// question posted before the injury - see isUnavailable below.
	unavailablePlayerIds: Set<string>
	espnAthleteIdByPlayerId: Map<string, string>
	seasonStatsFor: SeasonStatsFor
	// A team's per-game scoring this season and last, for the team over/under
	// lines - see teamSamples.
	teamSamplesFor: (
		teamId: string,
		year: number,
		template: { priorWeight: number; priorStat: string },
	) => Promise<Samples>
	// How much the other side of this game moves a team line - see
	// opponentFor. Null where the template asks for no adjustment.
	opponentFor: (
		opponentTeamId: string,
		year: number,
		template: { priorWeight: number; oppWeight?: number },
	) => Promise<OpponentAdjustment | null>
	// What a player head-to-head or leader pool is priced from: the resolved
	// lines of the over/under on the same stat, measured the same way, or the
	// box scores until there are enough of those - see withBoxSpread.
	duelSpreadFor: (
		statName: string,
		espnStat: string | readonly string[],
	) => Promise<DuelSpread>
	// Each pool player's price on a leader question, by player id - see
	// priceLeaderPool. Empty when the pool can't be priced.
	leaderPricesFor: (
		game: DueGame,
		template: Extract<GameQuestionTemplate, { shape: "player_game_stat_leader" }>,
		playerIds: string[],
	) => Promise<Map<string, PricedSide>>
}

type PlannedQuestion = {
	key: string
	title: GameQuestionTitleFacts
	subjectTeamId?: string
	subjectPlayerId?: string
	ouLine?: number
	lineBasis?: LineBasis
	leaderBasis?: LeaderBasis
	options: {
		label: string
		sortOrder: number
		playerId?: string
		winMult?: number
		lossRate?: number
		modelHitRate?: number
	}[]
}

function loadCatalogStats(sportId: string, names: string[]) {
	return db.query.stats.findMany({
		where: { sportId, name: { in: names } },
		with: { toleranceTier: true, teamToleranceTier: true },
	})
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
		pick.source === "roster" && !startersPosted(gameStarters, teamId, pick.role)
			? rosterCandidates(ctx.rostersByTeamId.get(teamId) ?? [], teamId, pick)
			: eligibleStarters(gameStarters, teamId, pick)
	const eligible = candidates.filter((candidate) =>
		ctx.playerNameById.has(candidate.playerId),
	)
	const samplesByPlayerId = new Map<string, Samples>()
	for (const candidate of eligible) {
		samplesByPlayerId.set(
			candidate.playerId,
			await playerSamples(
				ctx.seasonStatsFor,
				ctx.espnAthleteIdByPlayerId.get(candidate.playerId),
				pick,
				game.season.year,
			),
		)
	}
	const samplesOf = (candidate: StarterCandidate): Samples =>
		samplesByPlayerId.get(candidate.playerId) ?? { season: null, prior: null }
	return rankCandidates(eligible, (candidate) => {
		const { season, prior } = samplesOf(candidate)
		return blendSamples(season, prior, pick.priorWeight)?.mean ?? null
	}).map((candidate) => ({ candidate, samples: samplesOf(candidate) }))
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
	isClaimed: (playerId: string) => boolean,
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
		.with(
			{ shape: "team_stat_over_under" },
			async ({ statName, line, priorWeight, priorStat, oppWeight }) => {
				const planned: PlannedQuestion[] = []
				for (const team of teams) {
					const key = generationKey([...base, team.id])
					if (isFilled(key)) continue
					const { season, prior } = await ctx.teamSamplesFor(
						team.id,
						game.season.year,
						{ priorWeight, priorStat },
					)
					const opponent = await ctx.opponentFor(
						team.id === game.homeTeamId ? game.awayTeamId : game.homeTeamId,
						game.season.year,
						{ priorWeight, oppWeight },
					)
					// A team too early in the season to carry a line is skipped;
					// the numeric guess on the same stat still goes up.
					const basis = setLine(season, prior, priorWeight, line, opponent)
					if (!basis) continue
					planned.push({
						key,
						title: {
							shape: "team_stat_over_under",
							statName,
							teamId: team.id,
							ouLine: basis.line,
						},
						subjectTeamId: team.id,
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
		.with(
			{ shape: "game_total_over_under" },
			async ({ statName, line, priorWeight, priorStat, oppWeight }) => {
				const key = generationKey(base)
				if (isFilled(key)) return []
				const sideOf = async (team: Team) => {
					const { season, prior } = await ctx.teamSamplesFor(
						team.id,
						game.season.year,
						{ priorWeight, priorStat },
					)
					const opponent = await ctx.opponentFor(
						team.id === game.homeTeamId ? game.awayTeamId : game.homeTeamId,
						game.season.year,
						{ priorWeight, oppWeight },
					)
					return { season, prior, opponent }
				}
				const basis = setTotalLine(
					[await sideOf(game.awayTeam), await sideOf(game.homeTeam)],
					priorWeight,
					line,
				)
				if (!basis) return []
				return [
					{
						key,
						title: {
							shape: "game_total_over_under",
							statName,
							ouLine: basis.line,
						},
						ouLine: basis.line,
						lineBasis: basis,
						options: [
							{ label: "Over", sortOrder: 0 },
							{ label: "Under", sortOrder: 1 },
						],
					},
				]
			},
		)
		.with({ shape: "player_game_stat_leader" }, async (leader) => {
			const { statName, pick } = leader
			const key = generationKey(base)
			if (isFilled(key)) return []
			// Someone on the IL can't lead a stat, and neither can a position
			// that never records it (see canLeadStat). Leaving either in only
			// tempts a call that's dead on arrival.
			const pool = (
				await buildPlayerPool({
					teamIds: [game.awayTeamId, game.homeTeamId],
				})
			).filter(
				(player) =>
					isPlayable(player.injuryStatus) &&
					canLeadStat(player, ctx.league.slug, statName),
			)
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
			const prices = await ctx.leaderPricesFor(
				game,
				leader,
				pool.map((player) => player.id),
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
						...prices.get(player.id),
					})),
				},
			]
		})
		.with({ shape: "player_vs_player" }, async ({ statName, pick }) => {
			if (isFilled(generationKey(base))) return []
			// Drawn from each side's best starters that nothing on the game
			// already asks about.
			const pickSide = async (teamId: string) =>
				chooseFrom(
					(await rankedStarters(ctx, game, teamId, pick)).filter(
						({ candidate }) => !isClaimed(candidate.playerId),
					),
					pick.choose,
					generationKey([...base, teamId]),
				)
			const away = await pickSide(game.awayTeamId)
			const home = await pickSide(game.homeTeamId)
			if (!away || !home) return []
			const awayId = away.candidate.playerId
			const homeId = home.candidate.playerId
			// Each side's average in the stat being compared. One with none on
			// record (a reliever opening a bullpen game has no starts to divide
			// by) can't be compared, and a gap past GENERATED_DUEL_MIN_RATIO is
			// settled before the game starts.
			const [awayMean, homeMean] = [away, home].map(
				({ samples }) =>
					blendSamples(samples.season, samples.prior, pick.priorWeight)
						?.mean ?? null,
			)
			if (awayMean == null || homeMean == null) return []
			const share = shareOfLeader(awayMean, homeMean)
			if (share !== null && share < GENERATED_DUEL_MIN_RATIO) return []
			const [awayPrice, homePrice] =
				priceDuel(
					await ctx.duelSpreadFor(statName, pick.espnStat),
					awayMean,
					homeMean,
				) ?? []
			return [
				{
					key: generationKey([...base, awayId, homeId]),
					title: {
						shape: "player_vs_player",
						statName,
						playerNames: [nameOf(awayId), nameOf(homeId)],
					},
					options: [
						{
							label: nameOf(awayId),
							sortOrder: 0,
							playerId: awayId,
							...awayPrice,
						},
						{
							label: nameOf(homeId),
							sortOrder: 1,
							playerId: homeId,
							...homePrice,
						},
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
					// that nothing on the game already asks about. One without enough
					// games falls through to the next.
					const lined = (
						await rankedStarters(ctx, game, team.id, pick)
					).flatMap(({ candidate, samples }) => {
						if (isClaimed(candidate.playerId)) return []
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
					(template.shape === "player_game_stat_leader"
						? ctx.leaderLossByStatName.get(template.statName)
						: undefined) ?? defaultLossRate(template.shape, {}),
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
					winMult: option.winMult ?? null,
					lossRate: option.lossRate ?? null,
					modelHitRate: option.modelHitRate ?? null,
				})),
			)
		}
		return true
	})
}

// A leader question's prices keep up with its pool's averages until someone
// calls it - see repriceUncalled. A pool that can't be priced this run leaves
// whatever it has.
async function repriceLeader(
	ctx: LeagueContext,
	game: DueGame,
	template: Extract<GameQuestionTemplate, { shape: "player_game_stat_leader" }>,
	questionId: string,
): Promise<void> {
	const options = await db.query.questionOptions.findMany({
		where: { questionId },
		columns: {
			id: true,
			playerId: true,
			winMult: true,
			lossRate: true,
			modelHitRate: true,
		},
	})
	const prices = await ctx.leaderPricesFor(
		game,
		template,
		options.flatMap((option) => (option.playerId ? [option.playerId] : [])),
	)
	if (prices.size === 0) return
	await db.transaction((tx) =>
		repriceUncalled(
			tx,
			questionId,
			options.map((option) => ({
				option,
				next: (option.playerId && prices.get(option.playerId)) || null,
			})),
		),
	)
}

// A head-to-head's prices keep up with both players' averages until someone
// calls it, the same as a leader pool's (see repriceLeader). Its options are
// away player then home player, the order priceDuel prices them in.
async function repriceDuel(
	ctx: LeagueContext,
	game: DueGame,
	template: Extract<GameQuestionTemplate, { shape: "player_vs_player" }>,
	questionId: string,
): Promise<void> {
	const options = await db.query.questionOptions.findMany({
		where: { questionId },
		columns: {
			id: true,
			playerId: true,
			winMult: true,
			lossRate: true,
			modelHitRate: true,
		},
		orderBy: { sortOrder: "asc" },
	})
	const [away, home] = options
	if (options.length !== 2 || !away?.playerId || !home?.playerId) return
	const meanOf = async (playerId: string) => {
		const { season, prior } = await playerSamples(
			ctx.seasonStatsFor,
			ctx.espnAthleteIdByPlayerId.get(playerId),
			template.pick,
			game.season.year,
		)
		return blendSamples(season, prior, template.pick.priorWeight)?.mean ?? null
	}
	const awayMean = await meanOf(away.playerId)
	const homeMean = await meanOf(home.playerId)
	if (awayMean == null || homeMean == null) return
	const sides = priceDuel(
		await ctx.duelSpreadFor(template.statName, template.pick.espnStat),
		awayMean,
		homeMean,
	)
	if (!sides) return
	await db.transaction((tx) =>
		repriceUncalled(
			tx,
			questionId,
			options.map((option, index) => ({ option, next: sides[index] ?? null })),
		),
	)
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
	// way its slot opens for whoever is starting now. A question from a
	// template retired from the catalog comes down the same way, and never
	// holds a slot.
	const liveKeys: string[] = []
	let removed = 0
	for (const question of existing) {
		const key = question.generationKey
		if (!key) continue
		const parsed = parseGenerationKey(key)
		if (
			parsed &&
			question.status === "open" &&
			ctx.retiredTemplateIds.has(parsed.templateId)
		) {
			if (await deleteIfUncalled(question.id)) removed++
			continue
		}
		const template = parsed ? templateById.get(parsed.templateId) : undefined
		if (
			parsed &&
			template &&
			question.status === "open" &&
			isStale(template, parsed.rest, starters, game, (playerId) =>
				ctx.unavailablePlayerIds.has(playerId),
			)
		) {
			if (await deleteIfUncalled(question.id)) removed++
			continue
		}
		if (template && question.status === "open") {
			if (template.shape === "player_game_stat_leader") {
				await repriceLeader(ctx, game, template, question.id)
			} else if (template.shape === "player_vs_player") {
				await repriceDuel(ctx, game, template, question.id)
			}
		}
		liveKeys.push(key)
	}
	const isFilled = (slot: string) => liveKeys.some((key) => isInSlot(key, slot))

	// A player is the subject of at most one question per game: stats on the
	// same player move together (a home run is an RBI), so a second question
	// about them mostly re-asks the first.
	const claimed = new Set<string>()
	const claim = (template: GameQuestionTemplate, key: string) => {
		const parsed = parseGenerationKey(key)
		if (!parsed) return
		for (const playerId of subjectPlayerIds(template, parsed.rest)) {
			claimed.add(playerId)
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
	const isClaimed = (playerId: string) => claimed.has(playerId)

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
	access: EspnAccess,
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
	const inWindow = gamesInWindow(upcoming, window, now)
	const askable = await Promise.all(inWindow.map(isGameAskable))
	const due = inWindow
		.filter((_, i) => askable[i])
		.map((game) => {
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
	const teamIds = [
		...new Set(due.flatMap((game) => [game.awayTeamId, game.homeTeamId])),
	]
	const [players, espnAthleteIdByPlayerId, espnTeamIdByTeamId] =
		await Promise.all([
			playerIds.length > 0
				? db.query.players.findMany({ where: { id: { in: playerIds } } })
				: [],
			loadEspnIds("player", playerIds),
			loadEspnIds("team", teamIds),
		])

	const seasonTableFor = createSeasonTableCache(league.id)
	const teamScoresFor = teamScoresFrom(seasonTableFor)
	const teamSeasonStatsFor = createTeamSeasonStatsCache(config, access)
	const opponentDeps: OpponentDeps = {
		seasonTableFor,
		standingsFor: createStandingsCache(config, access),
		espnTeamIdByTeamId,
	}

	const duelSpreads = new Map<string, Promise<DuelSpread>>()
	// The player over/under on a stat, measured the same way, whose resolved
	// lines a head-to-head or leader pool on it is priced from. Read from the
	// whole catalog, not just what this run posts: an over/under above the
	// league's tier still has lines from when it was posted.
	const playerLineFor = (
		statName: string,
		espnStat: string | readonly string[],
	) =>
		playerLineTemplateFor(
			[...templates, ...(GAME_QUESTION_CATALOG[league.slug] ?? [])],
			statName,
			espnStat,
		)
	const ctx: LeagueContext = {
		config,
		league,
		officialAccountId,
		templates,
		retiredTemplateIds: new Set(
			catalog.retiredTemplateIds?.[league.slug] ??
				RETIRED_GAME_TEMPLATE_IDS[league.slug] ??
				[],
		),
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
		unavailablePlayerIds: new Set(
			players
				.filter((player) => !isPlayable(player.injuryStatus))
				.map((player) => player.id),
		),
		espnAthleteIdByPlayerId,
		seasonStatsFor: createSeasonStatsCache(config, access),
		teamSamplesFor: (teamId, year, template) =>
			teamSamples(
				teamScoresFor,
				teamSeasonStatsFor,
				espnTeamIdByTeamId.get(teamId),
				template,
				teamId,
				year,
			),
		opponentFor: (opponentTeamId, year, template) =>
			opponentFor(opponentDeps, template, opponentTeamId, year),
		duelSpreadFor: (statName, espnStat) => {
			const key = `${statName}:${[espnStat].flat().join("+")}`
			const cached = duelSpreads.get(key)
			if (cached) return cached
			const line = playerLineFor(statName, espnStat)
			const spread = Promise.all([
				line
					? duelSpreadFor(league.slug, line.id, LINE_FORMULA.teamOnly)
					: { ratios: [], pairs: [] },
				playerBoxSpread({
					leagueId: league.id,
					leagueSlug: league.slug,
					statName,
					asOf: now,
				}),
			]).then(([lines, box]) => withBoxSpread(lines, box))
			duelSpreads.set(key, spread)
			return spread
		},
		leaderPricesFor: async (game, template, playerIds) => {
			const line = playerLineFor(template.statName, template.pick.espnStat)
			const { ratios } = await ctx.duelSpreadFor(
				template.statName,
				template.pick.espnStat,
			)
			return priceLeaderPool({
				leagueSlug: league.slug,
				statName: template.statName,
				seasonId: game.seasonId,
				asOf: game.startsAt,
				playerIds,
				// A stat with no over/under (sacks, blocks) takes the floor every
				// box-score average is read at.
				minGames: line?.line.minGames ?? BOX_PRIOR_GAMES,
				ratios,
			})
		},
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
	espn = defaultEspnClient,
	catalog = {},
}: {
	now?: Date
	spacingMs?: number
	espn?: EspnClient
	catalog?: CatalogOverride
} = {}): Promise<void> {
	const officialAccountId = await getOfficialAccountId()
	const requester = createEspnRequester("generate-game-questions", spacingMs)

	for (const config of SYNCED_LEAGUES) {
		const { games, created, removed } = await generateForLeague(
			config,
			now,
			{ espn, requester },
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

runCli(import.meta.url, generateGameQuestions, {
	lock: GENERATE_GAME_QUESTIONS_LOCK,
})
