import { autoResolutionSource } from "@called-my-shot/schemas"
import { defaultLossRate } from "@called-my-shot/scoring"
import { and, eq, inArray } from "drizzle-orm"
import { createGameWinnerPricer } from "../../lib/game-questions/game-score-model"
import { generationKey } from "../../lib/game-questions/generation-key"
import { getOfficialAccountId } from "../../lib/official-account"
import {
	isAskableBefore,
	refreshSeriesQuestions,
	type SeriesTemplate,
	saveSeriesGameChances,
	seriesWindow,
} from "../../lib/postseason/series-questions"
import {
	SERIES_DISTANCE_TEMPLATE,
	SERIES_WINNER_TEMPLATE,
} from "../../lib/postseason/settle"
import { insertQuestion, teamOptions } from "../../lib/questions/insert"
import { getCurrentSeason } from "../../lib/seasons"
import { db } from "../index"
import { type League, questions, type Team } from "../schema"
import { defaultEspnClient, type EspnClient } from "./espn-client"

type SeriesQuestion = {
	template: SeriesTemplate
	key: string
	shape: "team_vs_team" | "yes_no_prop"
	title: string
	options: { label: string; teamId?: string }[]
}

// Titles stay short: the round and the teams are shown next to the question
// wherever it appears (its card's series block, the game page's section).
function seriesQuestions(
	bestOf: number,
	away: Team,
	home: Team,
): SeriesQuestion[] {
	return [
		{
			template: "winner",
			key: SERIES_WINNER_TEMPLATE,
			shape: "team_vs_team",
			title: "Who wins the series?",
			options: teamOptions([away, home]),
		},
		{
			template: "distance",
			key: SERIES_DISTANCE_TEMPLATE,
			shape: "yes_no_prop",
			title: `Does the series go all ${bestOf} games?`,
			options: [{ label: "Yes" }, { label: "No" }],
		},
	]
}

// Two official questions on every postseason series longer than one game -
// who wins it, and whether it goes the distance. They sit on the series
// rather than on a game (gameId stays null), and settleSeries
// (lib/postseason/settle.ts) settles them once a team has won enough games.
//
// Each takes calls between the series' games, not just before Game 1: it
// locks when a game starts and reopens, repriced from the new series score,
// once that game is final (see refreshSeriesQuestions), so a call made later
// is worth less (see seriesStageWeight). One that hasn't been posted yet is
// posted at the next open window it can still be asked in. Idempotent per
// series through generationKey.
//
// Each run also reads the game score model for one game at each team's park,
// which is what every reprice until the next run prices the series from.
//
// Requires syncGames(config, league) to have already run for this league.
export async function syncSeriesQuestions(
	league: League,
	now: Date = new Date(),
	espn: EspnClient = defaultEspnClient,
): Promise<void> {
	const season = await getCurrentSeason(league.id)
	if (!season) return
	const openSeries = await db.query.postseasonSeries.findMany({
		where: {
			leagueId: league.id,
			seasonId: season.id,
			winnerTeamId: { isNull: true },
		},
	})
	if (openSeries.length === 0) return
	const officialAccountId = await getOfficialAccountId()
	const priceGame = createGameWinnerPricer(league.slug, league.id, espn)

	for (const series of openSeries) {
		if (!series.bestOf || series.bestOf < 2) continue
		const gameOne = await db.query.games.findFirst({
			where: { seriesId: series.id, seriesGameNumber: 1 },
			with: { homeTeam: true, awayTeam: true },
		})
		const { homeTeam, awayTeam } = gameOne ?? {}
		if (!gameOne || !homeTeam || !awayTeam) continue
		const bestOf = series.bestOf

		// The chance the home side wins, with each team at home in turn.
		const homeWinChance = async (home: Team, away: Team) => {
			const sides = await priceGame({
				homeTeam: home,
				awayTeam: away,
				seasonYear: season.year,
				seasonId: series.seasonId,
				seasonType: gameOne.seasonType,
			})
			return sides?.[1].modelHitRate ?? null
		}
		const [teamA, teamB] =
			homeTeam.id === series.teamAId
				? [homeTeam, awayTeam]
				: [awayTeam, homeTeam]
		const teamAHome = await homeWinChance(teamA, teamB)
		const teamBHome = await homeWinChance(teamB, teamA)

		const planned = seriesQuestions(bestOf, awayTeam, homeTeam).map(
			(question) => ({
				...question,
				key: generationKey([league.slug, series.id, question.key]),
			}),
		)

		await db.transaction(async (tx) => {
			if (teamAHome !== null && teamBHome !== null) {
				await saveSeriesGameChances(tx, series.id, { teamAHome, teamBHome })
			}

			const existing = await tx.query.questions.findMany({
				where: { generationKey: { in: planned.map((q) => q.key) } },
				columns: { generationKey: true },
			})
			const posted = new Set(existing.map((q) => q.generationKey))

			const window = await seriesWindow(tx, series.id, now)
			for (const question of planned) {
				if (
					!window ||
					posted.has(question.key) ||
					!isAskableBefore(question.template, bestOf, window.nextGameNumber)
				) {
					continue
				}
				// Posted unpriced and priced by the refresh below, in the same
				// transaction, so no call can land in between.
				await insertQuestion(
					tx,
					{
						shape: question.shape,
						title: question.title,
						creatorId: officialAccountId,
						isOfficial: true,
						sportId: league.sportId,
						leagueId: league.id,
						seasonId: series.seasonId,
						resolutionSource: autoResolutionSource("postseason"),
						resolutionMode: "system",
						locksAt: window.locksAt,
						lossRate: defaultLossRate(question.shape, {}),
					},
					{ generationKey: question.key, seriesId: series.id },
					question.options,
				)
			}

			// The same pass keeps an unsettled question's wording in step with
			// the template, as refreshGeneratedQuestionSchedule does for game
			// ones.
			for (const question of planned) {
				await tx
					.update(questions)
					.set({ title: question.title })
					.where(
						and(
							eq(questions.generationKey, question.key),
							inArray(questions.status, ["open", "locked"]),
						),
					)
			}

			await refreshSeriesQuestions(tx, series.id, now)
		})
	}
}
