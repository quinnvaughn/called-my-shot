import { match } from "ts-pattern"
import type { Question, QuestionOption } from "../../db/schema"
import {
	type Decision,
	fail,
	gradeHeadToHead,
	gradeLeader,
	gradeNumericGuess,
	gradeOverUnder,
	withReading,
} from "./decide"
import type { SeasonExtractor, SeasonSources, StatReading } from "./registry"

export type SeasonQuestionContext = {
	question: Pick<
		Question,
		"shape" | "ouLine" | "subjectPlayerId" | "subjectTeamId" | "statAggregation"
	>
	options: Pick<QuestionOption, "id" | "sortOrder" | "playerId" | "teamId">[]
	extractor: SeasonExtractor
	sources: SeasonSources
	espnAthleteIdByPlayerId: Map<string, string>
	espnTeamIdByTeamId: Map<string, string>
}

// Settles a season-long question from ESPN's regular-season numbers, or says
// why it can't. Pure, like decideGameQuestion.
export function decideSeasonQuestion(ctx: SeasonQuestionContext): Decision {
	const { question, options, extractor, sources } = ctx
	const aggregation = question.statAggregation ?? "total"

	const read = (subject: "player" | "team", id: string | null): StatReading => {
		if (extractor.subject !== subject) {
			return {
				kind: "unavailable",
				reason: "unmapped",
				detail: `not a ${subject} stat`,
			}
		}
		const espnIds =
			subject === "player"
				? ctx.espnAthleteIdByPlayerId
				: ctx.espnTeamIdByTeamId
		const espnId = id ? espnIds.get(id) : undefined
		if (!espnId) {
			return {
				kind: "unavailable",
				reason: "missing_external_ref",
				detail: `no ESPN id for ${subject} ${id}`,
			}
		}
		return extractor.read(sources, espnId, aggregation)
	}

	const overUnder = (value: number) =>
		gradeOverUnder(question.ouLine, options, value)

	const headToHead = (subject: "player" | "team"): Decision => {
		const [a, b] = options
		const idOf = (option: (typeof options)[number] | undefined) =>
			subject === "player" ? option?.playerId : option?.teamId
		const aId = idOf(a)
		const bId = idOf(b)
		if (!a || !b || !aId || !bId) {
			return fail("unmapped", `head-to-head question without two ${subject}s`)
		}
		return gradeHeadToHead(
			{ optionId: a.id, reading: read(subject, aId) },
			{ optionId: b.id, reading: read(subject, bId) },
		)
	}

	// Judged within the question's own pool, which is what its title asks. A
	// pool player who never played had none of the stat.
	const poolLeader = (): Decision => {
		const values: { optionId: string; value: number }[] = []
		for (const option of options) {
			const reading = read("player", option.playerId)
			if (reading.kind === "unavailable") {
				return fail(reading.reason, reading.detail)
			}
			values.push({
				optionId: option.id,
				value: reading.kind === "value" ? reading.value : 0,
			})
		}
		return gradeLeader(values)
	}

	return match(question.shape)
		.returnType<Decision>()
		.with("player_season_stat_over_under", () =>
			withReading(read("player", question.subjectPlayerId), overUnder),
		)
		.with("team_season_stat_over_under", () =>
			withReading(read("team", question.subjectTeamId), overUnder),
		)
		.with("team_season_stat_numeric_guess", () =>
			withReading(read("team", question.subjectTeamId), gradeNumericGuess),
		)
		.with("player_vs_player_season", () => headToHead("player"))
		.with("team_vs_team_season", () => headToHead("team"))
		.with("player_season_stat_leader", poolLeader)
		.with(
			"team_vs_team",
			"yes_no_prop",
			"player_season_award",
			"team_season_award",
			"player_award_finalists",
			"player_stat_over_under",
			"team_stat_over_under",
			"player_stat_numeric_guess",
			"team_stat_numeric_guess",
			"game_total_over_under",
			"player_vs_player",
			"player_game_stat_leader",
			(shape) =>
				fail("unmapped", `${shape} doesn't settle from season statistics`),
		)
		.exhaustive()
}
