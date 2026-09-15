import {
	autoResolutionSource,
	createQuestionSchema,
	resolutionModeFor,
} from "@called-my-shot/schemas"
import {
	defaultLossRate,
	isNumericGuessShape,
	isSeasonLongShape,
} from "@called-my-shot/scoring"
import { eq, sql } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../../../../db"
import {
	ballotQuestions,
	questionOptions,
	questions,
} from "../../../../db/schema"
import { requireUser } from "../../../../lib/auth"
import { buildPlayerPool, buildTeamPool } from "../../../../lib/award-pool"
import {
	AuthenticationError,
	AuthorizationError,
	ValidationError,
} from "../../../../lib/errors"
import { bandSettingFor } from "../../../../lib/game-questions/band-settings"
import { leaderLossRateFor } from "../../../../lib/game-questions/leader-settings"
import { titleLossRateFor } from "../../../../lib/game-questions/title-settings"
import { numericToleranceFor } from "../../../../lib/numeric-tolerance"
import { getOfficialAccountId } from "../../../../lib/official-account"
import { getCurrentSeason } from "../../../../lib/seasons"
import { builder } from "../../../builder"
import { CreateQuestionInput, QuestionPayload } from "../inputs"

builder.mutationFields((t) => ({
	createQuestion: t.field({
		type: QuestionPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, ValidationError],
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
			const parsed = createQuestionSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const data = parsed.data

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
			async function loadGameWithTeams(gameId: string) {
				return db.query.games.findFirst({
					where: { id: gameId },
					with: { homeTeam: true, awayTeam: true },
				})
			}
			let game: Awaited<ReturnType<typeof loadGameWithTeams>> | null = null
			let homeTeamName: string | null = null
			let awayTeamName: string | null = null
			if (data.gameId) {
				game = (await loadGameWithTeams(data.gameId)) ?? null
				if (!game) throw ValidationError.field("gameId", "Game not found")
				if (game.leagueId !== data.leagueId) {
					throw ValidationError.field(
						"gameId",
						"Game must belong to the selected league",
					)
				}
				if (!game.homeTeam || !game.awayTeam) {
					throw new Error("Game is missing its home/away team")
				}
				homeTeamName = game.homeTeam.name
				awayTeamName = game.awayTeam.name
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
			// validated to exist below (requireStatAppliesTo/gameId checks in the
			// structural-validation match) - here it's read optimistically since
			// `game` may not be loaded yet the first time this runs if gameId is
			// missing, in which case the pool is simply empty and the validation
			// match below rejects it.
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

			// Only meaningful for a catalog stat - a freeform customStat (over_under
			// and player_vs_player both allow one, see requireStat vs
			// requireCatalogStat in the shared schema) has no appliesTo to check
			// against, so it's left alone rather than rejected.
			function requireStatAppliesTo(kind: "player" | "team") {
				if (stat && stat.appliesTo !== "both" && stat.appliesTo !== kind) {
					throw ValidationError.field(
						"statId",
						`"${stat.name}" isn't tracked as a ${kind} stat`,
					)
				}
			}

			// Title itself is always data.title now (required - see title on
			// createQuestionSchema); this match is pure structured-field
			// validation, not title generation. generateQuestionTitle is what
			// the create-question form uses client-side to prefill that field, so
			// the two can't drift, but the server no longer needs its own copy of
			// the generated string.
			match(data.shape)
				.with("player_stat_over_under", () => {
					if (!subjectPlayer) {
						throw ValidationError.field("subjectPlayerId", "Player not found")
					}
					if (!data.gameId) {
						throw ValidationError.field("gameId", "Pick a game")
					}
					if (data.ouLine === undefined) {
						throw ValidationError.field("ouLine", "Set the line")
					}
					requireStatAppliesTo("player")
				})
				.with("team_stat_over_under", () => {
					if (!subjectTeam) {
						throw ValidationError.field("subjectTeamId", "Team not found")
					}
					if (!data.gameId) {
						throw ValidationError.field("gameId", "Pick a game")
					}
					if (data.ouLine === undefined) {
						throw ValidationError.field("ouLine", "Set the line")
					}
					requireStatAppliesTo("team")
				})
				.with("player_season_stat_over_under", () => {
					if (!subjectPlayer) {
						throw ValidationError.field("subjectPlayerId", "Player not found")
					}
					if (data.ouLine === undefined) {
						throw ValidationError.field("ouLine", "Set the line")
					}
					if (!data.statAggregation) {
						throw ValidationError.field(
							"statAggregation",
							"Say whether that's a total or a per-game average",
						)
					}
					requireStatAppliesTo("player")
				})
				.with("team_season_stat_over_under", () => {
					if (!subjectTeam) {
						throw ValidationError.field("subjectTeamId", "Team not found")
					}
					if (data.ouLine === undefined) {
						throw ValidationError.field("ouLine", "Set the line")
					}
					if (!data.statAggregation) {
						throw ValidationError.field(
							"statAggregation",
							"Say whether that's a total or a per-game average",
						)
					}
					requireStatAppliesTo("team")
				})
				.with("game_total_over_under", () => {
					if (!homeTeamName || !awayTeamName) {
						throw ValidationError.field("gameId", "Pick a game")
					}
					if (data.ouLine === undefined) {
						throw ValidationError.field("ouLine", "Set the line")
					}
					// A game-wide total is never about one specific player, same
					// subject kind as a team stat for this check's purposes.
					requireStatAppliesTo("team")
				})
				.with("player_stat_numeric_guess", () => {
					if (!subjectPlayer) {
						throw ValidationError.field("subjectPlayerId", "Player not found")
					}
					if (!data.gameId) {
						throw ValidationError.field("gameId", "Pick a game")
					}
					requireStatAppliesTo("player")
				})
				.with("team_stat_numeric_guess", () => {
					if (!subjectTeam) {
						throw ValidationError.field("subjectTeamId", "Team not found")
					}
					if (!data.gameId) {
						throw ValidationError.field("gameId", "Pick a game")
					}
					requireStatAppliesTo("team")
				})
				.with("team_season_stat_numeric_guess", () => {
					if (!subjectTeam) {
						throw ValidationError.field("subjectTeamId", "Team not found")
					}
					requireStatAppliesTo("team")
				})
				.with("player_vs_player", () => {
					const [a, b] = data.options ?? []
					if (!a?.label || !b?.label) {
						throw ValidationError.field("options", "Pick two players")
					}
					if (!data.gameId) {
						throw ValidationError.field("gameId", "Pick a game")
					}
					requireStatAppliesTo("player")
				})
				.with("player_vs_player_season", () => {
					const [a, b] = data.options ?? []
					if (!a?.label || !b?.label) {
						throw ValidationError.field("options", "Pick two players")
					}
					if (!data.statAggregation) {
						throw ValidationError.field(
							"statAggregation",
							"Say whether that's a total or a per-game average",
						)
					}
					requireStatAppliesTo("player")
				})
				.with("team_vs_team_season", () => {
					const [a, b] = data.options ?? []
					if (!a?.label || !b?.label) {
						throw ValidationError.field("options", "Pick two teams")
					}
					if (!data.statAggregation) {
						throw ValidationError.field(
							"statAggregation",
							"Say whether that's a total or a per-game average",
						)
					}
					requireStatAppliesTo("team")
				})
				.with("team_vs_team", () => {
					if (!homeTeamName || !awayTeamName) {
						throw ValidationError.field("gameId", "Pick a game")
					}
				})
				// yes_no_prop and player_award_finalists have nothing left to check
				// here - createQuestionSchema's own superRefine (requireAwardName,
				// the eventClause check) already guarantees their required fields
				// by the time data exists.
				.with("yes_no_prop", () => {})
				.with("player_season_award", () => {
					if (
						!awardPlayerPool ||
						awardPlayerPool.length < (data.picksRequired ?? 1)
					) {
						throw ValidationError.field(
							"awardConferences",
							"No players match that conference/division/position - check the values",
						)
					}
				})
				.with("team_season_award", () => {
					if (
						!awardTeamPool ||
						awardTeamPool.length < (data.picksRequired ?? 1)
					) {
						throw ValidationError.field(
							"awardConferences",
							"No teams match that conference/division - check the values",
						)
					}
				})
				.with("player_award_finalists", () => {})
				.with("player_game_stat_leader", () => {
					if (!game || !homeTeamName || !awayTeamName) {
						throw ValidationError.field("gameId", "Pick a game")
					}
					requireStatAppliesTo("player")
					if (!gameLeaderPool || gameLeaderPool.length < 2) {
						throw ValidationError.field(
							"statId",
							"Not enough players on either roster for this game yet",
						)
					}
				})
				// No pool check to mirror the game-scoped arm above - this pool is
				// the creator's own curated list, already size- and
				// playerId-validated by createQuestionSchema's requirePool, not
				// something derived here that could come back empty. No
				// statAggregation check either: it is genuinely optional on this
				// shape (see its arm in createQuestionSchema).
				.with("player_season_stat_leader", () => {
					requireStatAppliesTo("player")
				})
				.exhaustive()

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

			const title = data.title

			// Game-scoped: copied straight off the picked game. Game-less: the
			// league's current season at creation time. Never client-supplied -
			// there's no seasonId field in createQuestionSchema. questions.seasonId
			// is NOT NULL, so a league with nothing synced yet can't have
			// questions created against it at all - that's a real "this league
			// isn't ready" state, not something to paper over with a null.
			const seasonId =
				game?.seasonId ?? (await getCurrentSeason(data.leagueId))?.id
			if (!seasonId) {
				throw ValidationError.field(
					"leagueId",
					"This league isn't set up yet - no season data has synced for it.",
				)
			}

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

			const question = await db.transaction(async (tx) => {
				const [question] = await tx
					.insert(questions)
					.values({
						shape: data.shape,
						title,
						creatorId,
						isOfficial: data.isOfficial ?? false,
						sportId: data.sportId,
						leagueId: data.leagueId,
						gameId: data.gameId ?? null,
						seasonId,
						resolutionMode,
						resolutionSource: isSystem
							? autoResolutionSource(
									data.shape === "team_season_award"
										? "postseason"
										: isSeasonLongShape(data.shape)
											? "season"
											: "game",
								)
							: data.resolutionSource,
						resolutionSourceUrl: isSystem
							? null
							: data.resolutionSourceUrl || null,
						locksAt: game?.startsAt ?? new Date(data.locksAt),
						statId: data.statId ?? null,
						customStat: data.customStat || null,
						ouLine: data.ouLine ?? null,
						statAggregation: data.statAggregation ?? null,
						subjectTeamId: data.subjectTeamId ?? null,
						subjectPlayerId: data.subjectPlayerId ?? null,
						numericTolerancePct,
						numericToleranceAbsolute,
						lossRate,
						picksRequired: data.picksRequired ?? null,
						eventClause: data.eventClause || null,
						awardName: data.awardName || null,
						awardVerb: data.awardVerb ?? null,
						awardConferences: data.awardConferences?.length
							? data.awardConferences
							: null,
						awardDivisions: data.awardDivisions?.length
							? data.awardDivisions
							: null,
						awardPositions: data.awardPositions?.length
							? data.awardPositions
							: null,
						awardSeasonsInLeague: data.awardSeasonsInLeague?.length
							? data.awardSeasonsInLeague
							: null,
						awardRookieOnly: data.awardRookieOnly || null,
					})
					.returning()

				await match(data.shape)
					.with(
						"player_vs_player",
						"player_vs_player_season",
						"team_vs_team_season",
						"player_award_finalists",
						"player_season_stat_leader",
						async () => {
							const options = data.options ?? []
							await tx.insert(questionOptions).values(
								options.map((option, index) => ({
									questionId: question.id,
									label: option.label,
									sortOrder: index,
									teamId: option.teamId ?? null,
									playerId: option.playerId ?? null,
								})),
							)
						},
					)
					.with("player_season_award", async () => {
						await tx.insert(questionOptions).values(
							(awardPlayerPool ?? []).map((player, index) => ({
								questionId: question.id,
								label: player.name,
								sortOrder: index,
								playerId: player.id,
							})),
						)
					})
					.with("team_season_award", async () => {
						await tx.insert(questionOptions).values(
							(awardTeamPool ?? []).map((team, index) => ({
								questionId: question.id,
								label: team.name,
								sortOrder: index,
								teamId: team.id,
							})),
						)
					})
					.with("player_game_stat_leader", async () => {
						await tx.insert(questionOptions).values(
							(gameLeaderPool ?? []).map((player, index) => ({
								questionId: question.id,
								label: player.name,
								sortOrder: index,
								playerId: player.id,
							})),
						)
					})
					.with("yes_no_prop", async () => {
						await tx.insert(questionOptions).values([
							{ questionId: question.id, label: "Yes", sortOrder: 0 },
							{ questionId: question.id, label: "No", sortOrder: 1 },
						])
					})
					.with(
						"player_stat_over_under",
						"team_stat_over_under",
						"player_season_stat_over_under",
						"team_season_stat_over_under",
						"game_total_over_under",
						async () => {
							// Bare "Over"/"Under" - the line itself isn't part of the
							// stored label, it's appended for display by
							// optionDisplayLabel (web) wherever an over/under option
							// renders, same as "Yes"/"No" above needs no line at all.
							// Baking ouLine in here too would double it up on every
							// render.
							await tx.insert(questionOptions).values([
								{
									questionId: question.id,
									label: "Over",
									sortOrder: 0,
								},
								{
									questionId: question.id,
									label: "Under",
									sortOrder: 1,
								},
							])
						},
					)
					.with("team_vs_team", async () => {
						if (!game || !homeTeamName || !awayTeamName) {
							throw ValidationError.field("gameId", "Pick a game")
						}
						await tx.insert(questionOptions).values([
							{
								questionId: question.id,
								label: awayTeamName,
								sortOrder: 0,
								teamId: game.awayTeamId,
							},
							{
								questionId: question.id,
								label: homeTeamName,
								sortOrder: 1,
								teamId: game.homeTeamId,
							},
						])
					})
					.with(
						"player_stat_numeric_guess",
						"team_stat_numeric_guess",
						"team_season_stat_numeric_guess",
						async () => {
							// No options row - scored via calls.guessValue directly.
						},
					)
					.exhaustive()

				if (data.ballot) {
					const [{ maxSortOrder }] = await tx
						.select({
							maxSortOrder: sql<number>`coalesce(max(${ballotQuestions.sortOrder}), -1)`,
						})
						.from(ballotQuestions)
						.where(eq(ballotQuestions.ballotId, data.ballot.ballotId))
					await tx.insert(ballotQuestions).values({
						ballotId: data.ballot.ballotId,
						questionId: question.id,
						label: data.ballot.label,
						slot: data.ballot.slot ?? null,
						section: data.ballot.section ?? null,
						sortOrder: maxSortOrder + 1,
					})
				}

				return question
			})

			return { question }
		},
	}),
}))
