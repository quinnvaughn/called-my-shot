import { match } from "ts-pattern"
import type { LiveOptionValue, Question, QuestionOption } from "../../db/schema"
import {
	type Decision,
	type GameQuestionContext,
	gameSubjectReaders,
	gradeOverUnder,
} from "./decide"
import type { GameExtractor, StatReading } from "./registry"

export type LiveReading = {
	value: number | null
	optionValues: LiveOptionValue[] | null
}

export type LiveQuestionContext = Omit<
	GameQuestionContext,
	"question" | "options" | "extractor"
> & {
	question: Pick<
		Question,
		"shape" | "ouLine" | "subjectPlayerId" | "subjectTeamId"
	>
	options: Pick<QuestionOption, "id" | "sortOrder" | "playerId" | "teamId">[]
	// Null for team_vs_team, which reads the scoreboard rather than a stat.
	extractor: GameExtractor | null
}

// Mid-game, a subject with no line yet is just a subject who hasn't done
// anything yet, not a reason to void or retry. Nothing here grades.
const valueOf = (reading: StatReading): number | null =>
	reading.kind === "value" ? reading.value : null

// Where a game question stands so far, read from an in-progress box score the
// same way decideGameQuestion reads a final one. Null when there's nothing to
// show: a shape that doesn't settle from a box score, or no subject with a
// number yet.
export function readLiveGameQuestion(
	ctx: LiveQuestionContext,
): LiveReading | null {
	const { question, options, extractor, sources } = ctx

	const single = (value: number | null): LiveReading | null =>
		value === null ? null : { value, optionValues: null }
	const perOption = (optionValues: LiveOptionValue[]): LiveReading | null =>
		optionValues.some((o) => o.value !== null)
			? { value: null, optionValues }
			: null

	if (question.shape === "team_vs_team") {
		// The scoreboard, which every game has, rather than a stat.
		return perOption(
			options.map((option) => {
				const espnTeamId = option.teamId
					? ctx.espnTeamIdByTeamId.get(option.teamId)
					: undefined
				return {
					optionId: option.id,
					value: espnTeamId
						? (sources.box.scoreByEspnTeamId.get(espnTeamId) ?? null)
						: null,
				}
			}),
		)
	}
	if (!extractor) return null

	const { readPlayer, readTeam } = gameSubjectReaders({ ...ctx, extractor })

	// A pool player missing from readAll hasn't recorded the stat yet, the
	// same zero gradePoolLeader gives them.
	const poolValues = (): LiveReading | null => {
		if (extractor.subject !== "player" || !extractor.readAll) return null
		const all = extractor.readAll(sources)
		return perOption(
			options.map((option) => {
				const espnAthleteId = option.playerId
					? ctx.espnAthleteIdByPlayerId.get(option.playerId)
					: undefined
				return {
					optionId: option.id,
					value: espnAthleteId ? (all.get(espnAthleteId) ?? 0) : null,
				}
			}),
		)
	}

	return match(question.shape)
		.returnType<LiveReading | null>()
		.with("player_stat_over_under", "player_stat_numeric_guess", () =>
			single(valueOf(readPlayer(question.subjectPlayerId))),
		)
		.with("team_stat_over_under", "team_stat_numeric_guess", () =>
			single(valueOf(readTeam(question.subjectTeamId))),
		)
		.with("game_total_over_under", () => {
			const home = valueOf(readTeam(ctx.homeTeamId))
			const away = valueOf(readTeam(ctx.awayTeamId))
			return single(home === null || away === null ? null : home + away)
		})
		.with("player_vs_player", () =>
			perOption(
				options.map((option) => ({
					optionId: option.id,
					value: valueOf(readPlayer(option.playerId)),
				})),
			),
		)
		.with("player_game_stat_leader", poolValues)
		.with(
			"yes_no_prop",
			"player_season_award",
			"team_season_award",
			"player_award_finalists",
			"player_season_stat_over_under",
			"team_season_stat_over_under",
			"player_vs_player_season",
			"team_vs_team_season",
			"team_season_stat_numeric_guess",
			"player_season_stat_leader",
			"player_team_season_stat_leader",
			() => null,
		)
		.exhaustive()
}

// An over/under whose Over has already hit mid-game, settled the same way the
// final box score would settle it. Only a stat that never goes down can get
// here (onlyRises), so once it's past the line no later play takes it back.
// Null for everything else: an Over that hasn't cleared its line yet, and an
// Under, a numeric guess or a comparison, which all depend on the rest of the
// game.
export function clinchedOver(ctx: LiveQuestionContext): Decision | null {
	const { question, options, extractor } = ctx
	if (!extractor?.onlyRises || question.ouLine === null) return null
	const { readPlayer, readTeam } = gameSubjectReaders({ ...ctx, extractor })

	const value = match(question.shape)
		.returnType<number | null>()
		.with("player_stat_over_under", () =>
			valueOf(readPlayer(question.subjectPlayerId)),
		)
		.with("team_stat_over_under", () =>
			valueOf(readTeam(question.subjectTeamId)),
		)
		.with("game_total_over_under", () => {
			const home = valueOf(readTeam(ctx.homeTeamId))
			const away = valueOf(readTeam(ctx.awayTeamId))
			return home === null || away === null ? null : home + away
		})
		.with(
			"player_stat_numeric_guess",
			"team_stat_numeric_guess",
			"player_vs_player",
			"player_game_stat_leader",
			"team_vs_team",
			"yes_no_prop",
			"player_season_award",
			"team_season_award",
			"player_award_finalists",
			"player_season_stat_over_under",
			"team_season_stat_over_under",
			"player_vs_player_season",
			"team_vs_team_season",
			"team_season_stat_numeric_guess",
			"player_season_stat_leader",
			"player_team_season_stat_leader",
			() => null,
		)
		.exhaustive()
	if (value === null || value <= question.ouLine) return null

	const decision = gradeOverUnder(question.ouLine, options, value)
	return decision.kind === "resolve" ? decision : null
}
