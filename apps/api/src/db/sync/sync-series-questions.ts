import { autoResolutionSource } from "@called-my-shot/schemas"
import { defaultLossRate } from "@called-my-shot/scoring"
import { and, eq } from "drizzle-orm"
import { generationKey } from "../../lib/game-questions/generation-key"
import { getOfficialAccountId } from "../../lib/official-account"
import {
	SERIES_DISTANCE_TEMPLATE,
	SERIES_WINNER_TEMPLATE,
} from "../../lib/postseason/settle"
import { insertQuestion, teamOptions } from "../../lib/questions/insert"
import { getCurrentSeason } from "../../lib/seasons"
import { db } from "../index"
import { type League, questions, type Team } from "../schema"

type SeriesQuestion = {
	template: string
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
			template: SERIES_WINNER_TEMPLATE,
			shape: "team_vs_team",
			title: "Who wins the series?",
			options: teamOptions([away, home]),
		},
		{
			template: SERIES_DISTANCE_TEMPLATE,
			shape: "yes_no_prop",
			title: `Does the series go all ${bestOf} games?`,
			options: [{ label: "Yes" }, { label: "No" }],
		},
	]
}

// Two official questions on every postseason series longer than one game -
// who wins it, and whether it goes the distance - posted once Game 1 has a
// real start time and locking when it starts. They sit on the series rather
// than on Game 1 (gameId stays null), since nothing about Game 1's own result
// settles them; settleSeries (lib/postseason/settle.ts) does, once a team has
// won enough games. Idempotent per series through generationKey, and each run
// moves an open question's lock along with Game 1 if ESPN reschedules it.
//
// Requires syncGames(config, league) to have already run for this league.
export async function syncSeriesQuestions(
	league: League,
	now: Date = new Date(),
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

	for (const series of openSeries) {
		if (!series.bestOf || series.bestOf < 2) continue
		const gameOne = await db.query.games.findFirst({
			where: { seriesId: series.id, seriesGameNumber: 1 },
			with: { homeTeam: true, awayTeam: true },
		})
		const { homeTeam, awayTeam } = gameOne ?? {}
		if (!gameOne || !homeTeam || !awayTeam || gameOne.startTimeTbd) continue
		const bestOf = series.bestOf

		const keys = [SERIES_WINNER_TEMPLATE, SERIES_DISTANCE_TEMPLATE].map(
			(template) => generationKey([league.slug, series.id, template]),
		)

		await db.transaction(async (tx) => {
			const existing = await tx.query.questions.findMany({
				where: { generationKey: { in: keys } },
				columns: { generationKey: true },
			})
			const posted = new Set(existing.map((q) => q.generationKey))

			const planned = seriesQuestions(bestOf, awayTeam, homeTeam)
			if (gameOne.status === "scheduled" && gameOne.startsAt > now) {
				for (const question of planned) {
					const key = generationKey([league.slug, series.id, question.template])
					if (posted.has(key)) continue
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
							locksAt: gameOne.startsAt,
							lossRate: defaultLossRate(question.shape, {}),
						},
						{ generationKey: key, seriesId: series.id },
						question.options,
					)
				}
			}

			// The same pass keeps an open question's wording in step with the
			// template, as refreshGeneratedQuestionSchedule does for game ones.
			for (const question of planned) {
				await tx
					.update(questions)
					.set({ locksAt: gameOne.startsAt, title: question.title })
					.where(
						and(
							eq(
								questions.generationKey,
								generationKey([league.slug, series.id, question.template]),
							),
							eq(questions.status, "open"),
						),
					)
			}
		})
	}
}
