import { autoResolveStatKeyFor } from "@called-my-shot/schemas"
import {
	EXTRACTORS,
	type GameExtractor,
	type GameSourceNeed,
	type GameSources,
} from "../../lib/auto-resolve/registry"
import type { Question, QuestionOption } from "../schema"
import type { ParsedBoxScore } from "./box-score-parse"
import type { EspnClient, EspnSportPath } from "./espn-client"
import type { EspnRequester } from "./espn-requester"
import { byEspnId, loadEspnIds } from "./sync-refs"

// What a game question is read through: its own subject and its options'.
type SubjectQuestion = {
	subjectPlayerId: string | null
	options: Pick<QuestionOption, "playerId">[]
}

export const subjectPlayerIds = (question: SubjectQuestion) =>
	[question.subjectPlayerId, ...question.options.map((o) => o.playerId)].filter(
		(id): id is string => id !== null,
	)

// The ESPN ids one game's questions are read through: the event itself, both
// teams, and every player any of the questions names.
export async function loadGameEspnRefs(
	game: { id: string; homeTeamId: string; awayTeamId: string },
	questions: SubjectQuestion[],
) {
	const [eventIds, espnTeamIdByTeamId, espnAthleteIdByPlayerId] =
		await Promise.all([
			loadEspnIds("game", [game.id]),
			loadEspnIds("team", [game.homeTeamId, game.awayTeamId]),
			loadEspnIds("player", questions.flatMap(subjectPlayerIds)),
		])
	return {
		espnEventId: eventIds.get(game.id) ?? null,
		espnTeamIdByTeamId,
		espnAthleteIdByPlayerId,
		playerIdByEspnAthleteId: byEspnId(espnAthleteIdByPlayerId),
	}
}

export type GameEspnRefs = Awaited<ReturnType<typeof loadGameEspnRefs>>

// The game-scoped extractor a question's stat is read with, or null when it
// has none (a hand-written stat, a season-long shape).
export function gameExtractorFor(
	question: Pick<
		Question,
		"shape" | "customStat" | "statAggregation"
	> & { stat: { name: string } | null },
	leagueSlug: string,
): GameExtractor | null {
	const key = autoResolveStatKeyFor({
		shape: question.shape,
		leagueSlug,
		statName: question.stat?.name,
		customStat: question.customStat,
		statAggregation: question.statAggregation,
	})
	const extractor = key ? EXTRACTORS[key] : null
	return extractor?.scope === "game" ? extractor : null
}

// Everything beyond the box score that the planned extractors say they need,
// fetched once for the whole game. A need that couldn't be fetched in full is
// reported back, so the questions that depend on it can say so rather than
// read a gap as a zero.
export async function loadGameSources({
	box,
	planned,
	refs,
	espnEventId,
	leagueSlug,
	espnPath,
	espn,
	requester,
}: {
	box: ParsedBoxScore
	planned: { question: SubjectQuestion; extractor: GameExtractor | null }[]
	refs: GameEspnRefs
	espnEventId: string
	leagueSlug: string
	espnPath: EspnSportPath
	espn: EspnClient
	requester: EspnRequester
}): Promise<{ sources: GameSources; failedNeeds: Set<GameSourceNeed> }> {
	const needs = new Set(planned.flatMap((p) => p.extractor?.needs ?? []))
	const failedNeeds = new Set<GameSourceNeed>()
	const sources: GameSources = {
		box,
		didNotPlayByTeam: new Map(),
		athleteGameStats: new Map(),
	}

	if (needs.has("roster")) {
		for (const espnTeamId of refs.espnTeamIdByTeamId.values()) {
			const roster = await requester.request(
				`${leagueSlug} roster ${espnEventId}/${espnTeamId}`,
				() => espn.fetchCompetitorRoster(espnPath, espnEventId, espnTeamId),
			)
			if (!roster) {
				failedNeeds.add("roster")
				continue
			}
			sources.didNotPlayByTeam.set(
				espnTeamId,
				new Map(roster.map((e) => [String(e.playerId), e.didNotPlay === true])),
			)
		}
	}

	if (needs.has("athleteGameStats")) {
		const espnAthleteIds = new Set(
			planned
				.filter((p) => p.extractor?.needs.includes("athleteGameStats"))
				.flatMap((p) => subjectPlayerIds(p.question))
				.flatMap(
					(playerId) => refs.espnAthleteIdByPlayerId.get(playerId) ?? [],
				),
		)
		for (const espnAthleteId of espnAthleteIds) {
			// Not in the box score means they didn't appear, which the extractor
			// reads without these stats.
			const athlete = box.athletes.get(espnAthleteId)
			if (!athlete) continue
			const stats = await requester.request(
				`${leagueSlug} athlete ${espnAthleteId}`,
				() =>
					espn.fetchCompetitorAthleteStatistics(
						espnPath,
						espnEventId,
						athlete.espnTeamId,
						espnAthleteId,
					),
			)
			if (!stats) {
				failedNeeds.add("athleteGameStats")
				continue
			}
			sources.athleteGameStats.set(
				espnAthleteId,
				new Map(
					stats.splits.categories.flatMap((category) =>
						category.stats.map(
							(stat) => [`${category.name}.${stat.name}`, stat.value] as const,
						),
					),
				),
			)
		}
	}

	return { sources, failedNeeds }
}
