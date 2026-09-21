import { match } from "ts-pattern"
import type {
	AutoResolveFailure,
	Question,
	QuestionOption,
	QuestionVoidedReason,
} from "../../db/schema"
import type { ParsedBoxScore } from "../../db/sync/box-score-parse"
import type { GameExtractor, GameSources, StatReading } from "./registry"

export type Decision =
	| {
			kind: "resolve"
			correctOptionIds: string[]
			// The one number the whole question was about - a subject's stat for
			// an over/under, the guessed quantity for a numeric guess. The
			// comparison shapes have no such number and set optionValues instead.
			actualValue?: number
			// What each option's own subject put up, for the shapes graded by
			// comparing options against each other.
			optionValues?: { optionId: string; value: number }[]
			evidence: Record<string, number>
	  }
	| { kind: "void"; reason: QuestionVoidedReason }
	| {
			kind: "fail"
			reason: AutoResolveFailure
			detail: string
			// Whether trying again later could turn out differently.
			retryable: boolean
	  }

export type GameQuestionContext = {
	question: Pick<
		Question,
		"shape" | "ouLine" | "subjectPlayerId" | "subjectTeamId"
	>
	options: Pick<QuestionOption, "id" | "sortOrder" | "playerId">[]
	extractor: GameExtractor
	sources: GameSources
	espnAthleteIdByPlayerId: Map<string, string>
	playerIdByEspnAthleteId: Map<string, string>
	espnTeamIdByTeamId: Map<string, string>
	homeTeamId: string
	awayTeamId: string
}

// Missing data that may still show up: ESPN fills box scores in after the
// final whistle, and a request can simply fail.
const RETRYABLE_FAILURES: AutoResolveFailure[] = [
	"fetch_failed",
	"box_score_not_final",
	"subject_not_in_box_score",
]

// Readings are whole numbers or rounded to thousandths before they get here, so
// this only absorbs floating-point noise.
const EPSILON = 1e-9
const equal = (a: number, b: number) => Math.abs(a - b) < EPSILON

export function fail(reason: AutoResolveFailure, detail: string): Decision {
	return {
		kind: "fail",
		reason,
		detail,
		retryable: RETRYABLE_FAILURES.includes(reason),
	}
}

// A subject who didn't play voids the question; data that isn't there fails
// it; a value is handed on to be graded.
export function withReading(
	reading: StatReading,
	grade: (value: number) => Decision,
): Decision {
	return match(reading)
		.returnType<Decision>()
		.with({ kind: "value" }, ({ value }) => grade(value))
		.with({ kind: "did_not_play" }, () => ({
			kind: "void",
			reason: "subject_did_not_play",
		}))
		.with({ kind: "unavailable" }, ({ reason, detail }) => fail(reason, detail))
		.exhaustive()
}

// Over is the option at sortOrder 0 and Under the one at 1.
export function gradeOverUnder(
	ouLine: number | null,
	options: Pick<QuestionOption, "id" | "sortOrder">[],
	value: number,
): Decision {
	const over = options.find((o) => o.sortOrder === 0)
	const under = options.find((o) => o.sortOrder === 1)
	if (ouLine === null || !over || !under) {
		return fail("unmapped", "over/under question without a line or options")
	}
	if (equal(value, ouLine)) {
		return fail("push", `${value} landed exactly on the line`)
	}
	return {
		kind: "resolve",
		correctOptionIds: [value > ouLine ? over.id : under.id],
		actualValue: value,
		evidence: { value },
	}
}

export function gradeNumericGuess(value: number): Decision {
	return {
		kind: "resolve",
		correctOptionIds: [],
		actualValue: value,
		evidence: { value },
	}
}

type Side = { optionId: string; reading: StatReading }

// Either side not having played voids the matchup, and so does a tie: a push,
// where no call scores.
export function gradeHeadToHead(a: Side, b: Side): Decision {
	if (a.reading.kind === "did_not_play" || b.reading.kind === "did_not_play") {
		return { kind: "void", reason: "subject_did_not_play" }
	}
	if (a.reading.kind === "unavailable") {
		return fail(a.reading.reason, a.reading.detail)
	}
	if (b.reading.kind === "unavailable") {
		return fail(b.reading.reason, b.reading.detail)
	}
	if (equal(a.reading.value, b.reading.value)) {
		return { kind: "void", reason: "tie" }
	}
	return {
		kind: "resolve",
		correctOptionIds: [
			a.reading.value > b.reading.value ? a.optionId : b.optionId,
		],
		optionValues: [
			{ optionId: a.optionId, value: a.reading.value },
			{ optionId: b.optionId, value: b.reading.value },
		],
		evidence: { a: a.reading.value, b: b.reading.value },
	}
}

// Every option tied for the most is correct, same as a tie on an award. With
// nobody having recorded the stat there's no leader to pick, so no call scores.
export function gradeLeader(
	values: { optionId: string; value: number }[],
): Decision {
	const max = Math.max(0, ...values.map((v) => v.value))
	if (max <= 0) return { kind: "void", reason: "no_leader" }
	return {
		kind: "resolve",
		correctOptionIds: values
			.filter((v) => equal(v.value, max))
			.map((v) => v.optionId),
		optionValues: values,
		evidence: { max },
	}
}

export type FinalScoreContext = {
	options: Pick<QuestionOption, "id" | "teamId">[]
	box: ParsedBoxScore
	espnTeamIdByTeamId: Map<string, string>
}

// team_vs_team: the option for the team with the higher final score.
export function decideFinalScore(ctx: FinalScoreContext): Decision {
	const [a, b] = ctx.options
	if (!a?.teamId || !b?.teamId) {
		return fail("unmapped", "matchup question without two teams")
	}
	const scoreOf = (teamId: string): StatReading => {
		const espnTeamId = ctx.espnTeamIdByTeamId.get(teamId)
		if (!espnTeamId) {
			return {
				kind: "unavailable",
				reason: "missing_external_ref",
				detail: `no ESPN id for team ${teamId}`,
			}
		}
		const score = ctx.box.scoreByEspnTeamId.get(espnTeamId)
		return score === undefined
			? {
					kind: "unavailable",
					reason: "subject_not_in_box_score",
					detail: `no score for ESPN team ${espnTeamId}`,
				}
			: { kind: "value", value: score }
	}
	return gradeHeadToHead(
		{ optionId: a.id, reading: scoreOf(a.teamId) },
		{ optionId: b.id, reading: scoreOf(b.teamId) },
	)
}

// Settles a question from one box score, or says why it can't. Pure: every
// ESPN read has already happened, so this is only the grading.
export function decideGameQuestion(ctx: GameQuestionContext): Decision {
	const { question, options, extractor, sources } = ctx

	const readPlayer = (playerId: string | null): StatReading => {
		if (extractor.subject !== "player") {
			return {
				kind: "unavailable",
				reason: "unmapped",
				detail: "not a player stat",
			}
		}
		const espnAthleteId = playerId
			? ctx.espnAthleteIdByPlayerId.get(playerId)
			: undefined
		if (!espnAthleteId) {
			return {
				kind: "unavailable",
				reason: "missing_external_ref",
				detail: `no ESPN id for player ${playerId}`,
			}
		}
		return extractor.read(sources, espnAthleteId)
	}

	const readTeam = (teamId: string | null): StatReading => {
		if (extractor.subject !== "team") {
			return {
				kind: "unavailable",
				reason: "unmapped",
				detail: "not a team stat",
			}
		}
		const espnTeamId = teamId ? ctx.espnTeamIdByTeamId.get(teamId) : undefined
		if (!espnTeamId) {
			return {
				kind: "unavailable",
				reason: "missing_external_ref",
				detail: `no ESPN id for team ${teamId}`,
			}
		}
		return extractor.read(sources, espnTeamId)
	}

	const overUnder = (value: number) =>
		gradeOverUnder(question.ouLine, options, value)

	const headToHead = (): Decision => {
		const [a, b] = options
		if (!a?.playerId || !b?.playerId) {
			return fail("unmapped", "head-to-head question without two players")
		}
		return gradeHeadToHead(
			{ optionId: a.id, reading: readPlayer(a.playerId) },
			{ optionId: b.id, reading: readPlayer(b.playerId) },
		)
	}

	// The pool is fixed when the question is created, so a leader who wasn't in
	// it can't be marked correct.
	const gameLeader = (): Decision => {
		if (extractor.subject !== "player" || !extractor.readAll) {
			return fail("unmapped", "this stat can't settle a game leader")
		}
		const values = extractor.readAll(sources)
		const max = Math.max(0, ...values.values())

		const optionByPlayerId = new Map(
			options.flatMap((o) => (o.playerId ? [[o.playerId, o] as const] : [])),
		)
		// Every option in the pool, not just whoever tied for the most: grading
		// reads the same winner off it either way, and carrying the whole pool
		// is what lets the settled question say what the leader actually put
		// up. A pool player the box score doesn't list put up none of the stat,
		// the same reading a season pool leader gets.
		const valueByOptionId = new Map(
			options.flatMap((o): [string, number][] =>
				o.playerId ? [[o.id, 0]] : [],
			),
		)
		for (const [espnAthleteId, v] of values) {
			const playerId = ctx.playerIdByEspnAthleteId.get(espnAthleteId)
			const option = playerId ? optionByPlayerId.get(playerId) : undefined
			if (option) {
				valueByOptionId.set(option.id, v)
			} else if (max > 0 && equal(v, max)) {
				return fail(
					"leader_not_in_pool",
					`ESPN athlete ${espnAthleteId} led with ${v} but isn't an option`,
				)
			}
		}
		return gradeLeader(
			[...valueByOptionId].map(([optionId, value]) => ({ optionId, value })),
		)
	}

	return match(question.shape)
		.returnType<Decision>()
		.with("player_stat_over_under", () =>
			withReading(readPlayer(question.subjectPlayerId), overUnder),
		)
		.with("team_stat_over_under", () =>
			withReading(readTeam(question.subjectTeamId), overUnder),
		)
		.with("player_stat_numeric_guess", () =>
			withReading(readPlayer(question.subjectPlayerId), gradeNumericGuess),
		)
		.with("team_stat_numeric_guess", () =>
			withReading(readTeam(question.subjectTeamId), gradeNumericGuess),
		)
		.with("game_total_over_under", () =>
			withReading(readTeam(ctx.homeTeamId), (home) =>
				withReading(readTeam(ctx.awayTeamId), (away) => overUnder(home + away)),
			),
		)
		.with("player_vs_player", headToHead)
		.with("player_game_stat_leader", gameLeader)
		.with(
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
			(shape) => fail("unmapped", `${shape} doesn't settle from a box score`),
		)
		.exhaustive()
}
