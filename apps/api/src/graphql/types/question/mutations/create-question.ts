import {
	createQuestionSchema,
	resolutionModeFor,
} from "@called-my-shot/schemas"
import { defaultLossRate, isNumericGuessShape } from "@called-my-shot/scoring"
import { db } from "../../../../db"
import { requireUser } from "../../../../lib/auth"
import { buildPlayerPool, buildTeamPool } from "../../../../lib/award-pool"
import {
	AuthenticationError,
	AuthorizationError,
	ValidationError,
} from "../../../../lib/errors"
import { bandSettingFor } from "../../../../lib/game-questions/band-settings"
import { leaderLossRateFor } from "../../../../lib/game-questions/leader-settings"
import { priceUserLine } from "../../../../lib/game-questions/line-pricing"
import { titleLossRateFor } from "../../../../lib/game-questions/title-settings"
import { numericToleranceFor } from "../../../../lib/numeric-tolerance"
import { getOfficialAccountId } from "../../../../lib/official-account"
import { attachToBallot } from "../../../../lib/questions/ballot"
import {
	optionsFor,
	type ShapeContext,
	storedResolutionSource,
	validateShapeFields,
} from "../../../../lib/questions/create"
import { insertQuestion, listOrNull } from "../../../../lib/questions/insert"
import { requireCurrentSeason } from "../../../../lib/seasons"
import { builder } from "../../../builder"
import { parseInput } from "../../../helpers"
import { CreateQuestionInput, QuestionPayload } from "../inputs"

builder.mutationFields((t) => ({
	createQuestion: t.field({
		type: QuestionPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError],
			directResult: true,
			union: { name: "CreateQuestionResult" },
		},
		args: { input: t.arg({ type: CreateQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			if (!user.emailVerified) {
				throw new AuthorizationError(
					"Verify your email before posting a question.",
				)
			}
			if (!user.questionCreationEnabled) {
				throw new AuthorizationError(
					"Your question creation has been suspended. Contact support if you think this is a mistake.",
				)
			}
			const data = parseInput(createQuestionSchema, args.input)

			if (data.isOfficial && !user.isAdmin) {
				throw new AuthorizationError("Only admins can post official questions.")
			}
			// The create-question form only shows the ballot field to admins, but
			// that's a UI decision, not a security boundary - never trust the
			// client omitted this only because it hid the control.
			if (data.ballot && !user.isAdmin) {
				throw new AuthorizationError(
					"Only admins can add a question to a ballot.",
				)
			}

			// Official questions are attributed to the Called My Shot account
			// itself, never the admin who happened to click "post" - the byline
			// should read the same no matter which admin posted it.
			const creatorId = data.isOfficial ? await getOfficialAccountId() : user.id

			// When a game is picked, its own startsAt is what actually gets
			// stored as locksAt below - the create-question form disables that
			// field and fills it from the game client-side, but the server
			// re-derives it from the game row rather than trusting the
			// submitted string, so a stale or tampered locksAt can't desync
			// the two. homeTeam/awayTeam are loaded alongside it since
			// game_total_over_under and team_vs_team both need the real team
			// names for their generated title. Both relations are typed
			// nullable purely because drizzle types every `one` relation that
			// way regardless of the FK's own nullability (homeTeamId/
			// awayTeamId are NOT NULL) - same non-issue documented at length
			// elsewhere in this file (see resolveQuestionInternal).
			const gameRow = data.gameId
				? await db.query.games.findFirst({
						where: { id: data.gameId },
						with: {
							homeTeam: true,
							awayTeam: true,
							season: { columns: { year: true } },
						},
					})
				: null
			let game: ShapeContext["game"] = null
			if (data.gameId) {
				if (!gameRow) throw ValidationError.field("gameId", "Game not found")
				if (gameRow.leagueId !== data.leagueId) {
					throw ValidationError.field(
						"gameId",
						"Game must belong to the selected league",
					)
				}
				if (!gameRow.homeTeam || !gameRow.awayTeam) {
					throw new Error("Game is missing its home/away team")
				}
				game = {
					homeTeamId: gameRow.homeTeamId,
					awayTeamId: gameRow.awayTeamId,
					homeTeamName: gameRow.homeTeam.name,
					awayTeamName: gameRow.awayTeam.name,
				}
			}

			// Resolved once up front for the structured-field validation below -
			// only the fields a given shape actually uses end up set. Includes
			// both tolerance tiers so the numeric_guess tolerance snapshot below
			// can read off this one fetch instead of querying stats twice.
			const [stat, subjectPlayer, subjectTeam] = await Promise.all([
				data.statId
					? db.query.stats.findFirst({
							where: { id: data.statId },
							with: { toleranceTier: true, teamToleranceTier: true },
						})
					: null,
				data.subjectPlayerId
					? db.query.players.findFirst({ where: { id: data.subjectPlayerId } })
					: null,
				data.subjectTeamId
					? db.query.teams.findFirst({ where: { id: data.subjectTeamId } })
					: null,
			])

			// player_season_award/team_season_award only - the pool is always
			// fully determined by leagueId (+ these optional scoping fields), so
			// the server derives its own authoritative copy here rather than
			// trusting whatever data.options the client happened to submit (which
			// the create-question form only ever builds for the live preview -
			// see PoolSummary on the frontend). Fetched here, alongside the other
			// pre-transaction lookups, so it can both drive the structural
			// validation below and be inserted as-is inside the transaction. See
			// lib/award-pool.ts for the shared query logic (also used by
			// player_game_stat_leader below and by the recurring season-question
			// engine).
			const awardPlayerPool =
				data.shape === "player_season_award"
					? await buildPlayerPool(
							{ leagueId: data.leagueId },
							{
								conferences: data.awardConferences,
								divisions: data.awardDivisions,
								positions: data.awardPositions,
								seasonsInLeague: data.awardSeasonsInLeague,
								rookieOnly: data.awardRookieOnly,
							},
						)
					: null
			const awardTeamPool =
				data.shape === "team_season_award"
					? await buildTeamPool(
							{ leagueId: data.leagueId },
							{
								conferences: data.awardConferences,
								divisions: data.awardDivisions,
							},
						)
					: null

			// player_game_stat_leader only - pool is just the active rosters of
			// the two teams in the picked game, not the whole league (that's the
			// whole point of this shape vs. player_season_award). gameId is
			// validated to exist below (validateShapeFields) - here it's read optimistically since
			// `game` may not be loaded yet the first time this runs if gameId is
			// missing, in which case the pool is simply empty and the validation
			// check below rejects it.
			const gameLeaderPool =
				data.shape === "player_game_stat_leader" && game
					? await buildPlayerPool({
							teamIds: [game.homeTeamId, game.awayTeamId],
						})
					: null

			// The tolerance band comes from the stat's own tolerance tier, not
			// the creator - createQuestionSchema guarantees statId is set (no
			// customStat fallback) for these two shapes specifically, so a
			// creator can't set an unhittable or trivial-to-hit band by hand. See
			// numericToleranceFor for which of the stat's bands applies.
			const bandSetting =
				data.shape === "team_stat_numeric_guess" && stat
					? await bandSettingFor(data.leagueId, stat.name)
					: null
			const tolerance =
				isNumericGuessShape(data.shape) && stat
					? numericToleranceFor(data.shape, stat, bandSetting)
					: null
			if (isNumericGuessShape(data.shape) && !tolerance) {
				throw ValidationError.field("statId", "Pick a stat from the list")
			}
			const numericTolerancePct = tolerance?.numericTolerancePct ?? null
			const numericToleranceAbsolute =
				tolerance?.numericToleranceAbsolute ?? null
			// Saved on the question so a later retune can't change what a caller
			// agreed to - see questions.lossRate.
			const savedLossRate =
				data.shape === "player_game_stat_leader" && stat
					? await leaderLossRateFor(data.leagueId, stat.name)
					: data.shape === "team_season_award" &&
							(data.picksRequired ?? 1) === 1 &&
							data.awardName
						? await titleLossRateFor(data.leagueId, data.awardName)
						: null
			const lossRate =
				savedLossRate ??
				defaultLossRate(data.shape, {
					picksRequired: data.picksRequired,
					optionCount: data.options?.length,
				})

			const shapeContext: ShapeContext = {
				game,
				stat: stat ?? null,
				subjectPlayer: subjectPlayer ?? null,
				subjectTeam: subjectTeam ?? null,
				awardPlayerPool,
				awardTeamPool,
				gameLeaderPool,
			}
			validateShapeFields(data, shapeContext)

			// Loaded up front (same spot as the game/stat/award-pool lookups
			// above) so a bad ballot placement fails before the transaction opens,
			// not partway through it.
			const ballot = data.ballot
				? await db.query.ballots.findFirst({
						where: { id: data.ballot.ballotId },
					})
				: null
			if (data.ballot) {
				if (!ballot) {
					throw ValidationError.field("ballot", "Ballot not found")
				}
				if (ballot.leagueId !== data.leagueId) {
					throw ValidationError.field(
						"ballot",
						"Question must be in the same league as the ballot",
					)
				}
			}

			// Game-scoped: copied straight off the picked game. Game-less: the
			// league's current season at creation time. Never client-supplied -
			// there's no seasonId field in createQuestionSchema. questions.seasonId
			// is NOT NULL, so a league with nothing synced yet can't have
			// questions created against it at all - that's a real "this league
			// isn't ready" state, not something to paper over with a null.
			const seasonId =
				gameRow?.seasonId ?? (await requireCurrentSeason(data.leagueId)).id

			// A system question settles from ESPN, so there's no source for the
			// creator to name and ESPN's is stored instead - see resolutionModeFor.
			const league = await db.query.leagues.findFirst({
				where: { id: data.leagueId },
				columns: { slug: true },
			})
			if (!league) throw ValidationError.field("leagueId", "League not found")
			const resolutionMode = resolutionModeFor({
				shape: data.shape,
				leagueSlug: league.slug,
				statName: stat?.name,
				customStat: data.customStat,
				statAggregation: data.statAggregation,
				awardName: data.awardName,
				awardVerb: data.awardVerb,
				picksRequired: data.picksRequired,
				awardConferences: data.awardConferences,
				awardDivisions: data.awardDivisions,
			})
			if (resolutionMode === "manual" && !data.resolutionSource) {
				throw ValidationError.field(
					"resolutionSource",
					"Say where you'll check this",
				)
			}
			const isSystem = resolutionMode === "system"

			// A game stat line is priced per side from the model a generated line
			// on the same stat would use - see priceUserLine. Null leaves both
			// sides on lossRate.
			const pricedLine =
				(data.shape === "player_stat_over_under" ||
					data.shape === "team_stat_over_under") &&
				stat &&
				gameRow?.season &&
				data.ouLine !== undefined
					? await priceUserLine({
							leagueId: data.leagueId,
							shape: data.shape,
							statName: stat.name,
							ouLine: data.ouLine,
							subjectPlayerId: data.subjectPlayerId,
							subjectTeamId: data.subjectTeamId,
							seasonYear: gameRow.season.year,
						})
					: null
			const options = optionsFor(data, shapeContext).map((option) =>
				pricedLine && (option.label === "Over" || option.label === "Under")
					? {
							...option,
							lossRate:
								option.label === "Over" ? pricedLine.over : pricedLine.under,
						}
					: option,
			)

			const question = await db.transaction(async (tx) => {
				const question = await insertQuestion(
					tx,
					{
						shape: data.shape,
						title: data.title,
						creatorId,
						isOfficial: data.isOfficial ?? false,
						sportId: data.sportId,
						leagueId: data.leagueId,
						gameId: data.gameId ?? null,
						seasonId,
						resolutionMode,
						resolutionSource: storedResolutionSource(data, resolutionMode),
						resolutionSourceUrl: isSystem
							? null
							: data.resolutionSourceUrl || null,
						locksAt: gameRow?.startsAt ?? new Date(data.locksAt),
						lossRate,
					},
					{
						statId: data.statId ?? null,
						customStat: data.customStat || null,
						ouLine: data.ouLine ?? null,
						linePricing: pricedLine?.pricing ?? null,
						statAggregation: data.statAggregation ?? null,
						subjectTeamId: data.subjectTeamId ?? null,
						subjectPlayerId: data.subjectPlayerId ?? null,
						numericTolerancePct,
						numericToleranceAbsolute,
						picksRequired: data.picksRequired ?? null,
						eventClause: data.eventClause || null,
						awardName: data.awardName || null,
						awardVerb: data.awardVerb ?? null,
						awardConferences: listOrNull(data.awardConferences),
						awardDivisions: listOrNull(data.awardDivisions),
						awardPositions: listOrNull(data.awardPositions),
						awardSeasonsInLeague: listOrNull(data.awardSeasonsInLeague),
						awardRookieOnly: data.awardRookieOnly || null,
					},
					options,
				)

				if (data.ballot) {
					await attachToBallot(tx, {
						ballotId: data.ballot.ballotId,
						questionId: question.id,
						label: data.ballot.label,
						slot: data.ballot.slot,
						section: data.ballot.section,
					})
				}

				return question
			})

			return { question }
		},
	}),
}))
