import { defaultLossRate } from "@called-my-shot/scoring"
import { generationKey } from "../../lib/game-questions/generation-key"
import { refreshGeneratedQuestionSchedule } from "../../lib/game-questions/schedule"
import { gameQuestionTitle } from "../../lib/game-questions/titles"
import { getOfficialAccountId } from "../../lib/official-account"
import { getCurrentSeason } from "../../lib/seasons"
import { db } from "../index"
import { type League, questionOptions, questions } from "../schema"

// One team_vs_team question per synced game, created official (see
// ADMIN_ONLY_SHAPES in packages/schemas/src/questions.ts - team_vs_team is
// derived 1:1 from a game, so a regular creator posting one risks a
// duplicate matchup question; the sync job is the only thing that should
// create these). Most runs touch nothing: a game only needs its question
// created once. What does recur is ESPN moving a game's startsAt (a flex, a
// rain delay reschedule) after its questions already exist - that's synced
// into the locksAt and title of this question and of every other generated
// one on the game (see refreshGeneratedQuestionSchedule), so no lock time
// drifts from the real game. This runs across the whole season daily, which
// covers a game moved out of generate-game-questions.ts's own window.
//
// Requires syncGames(config, league) to have already run for this league.
export async function syncGameQuestions(league: League): Promise<void> {
	const officialAccountId = await getOfficialAccountId()
	const allLeagueGames = await db.query.games.findMany({
		where: { leagueId: league.id },
		with: { homeTeam: true, awayTeam: true },
	})

	// Every upcoming game of the current season gets its question in one
	// pass now, not paced out day by day - that pacing existed only to avoid
	// flooding the old "New" feed sort with months of far-future games
	// sharing one createdAt, and there's a real per-game destination (the
	// game detail page, reached via the Games tab) for discovery now, so
	// that concern is gone.
	//
	// Still bounded both directions. Lower: skip anything that's already
	// tipped off - there was never a window to call it, so a question for it
	// would only ever be poseable after the fact. Upper: scoped to the
	// current season (see getCurrentSeason) rather than every game ever
	// synced - this matters a lot on a league's very first sync, or in the
	// off-season before the new season's schedule is published: ESPN's
	// regular-season schedule endpoint returns whichever season it currently
	// considers "current," which in the gap between seasons is still last
	// season's full slate - hundreds of already-finished games syncGames
	// just backfilled that have no business getting a question now.
	const now = new Date()
	const season = await getCurrentSeason(league.id)
	// Descending: within a batch, each insert's createdAt lands a little
	// later than the previous one (sequential round trips, same as any
	// other loop of individual writes), and the NEW feed sort is createdAt
	// descending - so processing the farthest-out game first and the
	// soonest-starting one last means the soonest game ends up with the
	// newest createdAt and lands at the top, with the rest of the batch
	// falling in behind it in the same order they actually kick off.
	const leagueGames = allLeagueGames
		.filter(
			(game) =>
				game.startsAt >= now && (!season || game.seasonId === season.id),
		)
		.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())

	for (const game of leagueGames) {
		// homeTeamId/awayTeamId are NOT NULL - drizzle just types every `one`
		// relation as nullable regardless of the FK's own nullability, same
		// non-issue documented at length in loadGameWithTeams in
		// graphql/types/question/mutations/create-question.ts.
		if (!game.homeTeam || !game.awayTeam) {
			throw new Error(
				`syncGameQuestions: game ${game.id} is missing its home/away team`,
			)
		}
		const gameWithTeams = {
			id: game.id,
			startsAt: game.startsAt,
			homeTeam: game.homeTeam,
			awayTeam: game.awayTeam,
		}
		const key = generationKey([league.slug, game.id, "team_vs_team"])

		await db.transaction(async (tx) => {
			const existing = await tx.query.questions.findFirst({
				where: { generationKey: key },
			})

			if (!existing) {
				const [inserted] = await tx
					.insert(questions)
					.values({
						shape: "team_vs_team",
						title: gameQuestionTitle({ shape: "team_vs_team" }, gameWithTeams),
						creatorId: officialAccountId,
						isOfficial: true,
						sportId: league.sportId,
						leagueId: league.id,
						gameId: game.id,
						seasonId: game.seasonId,
						resolutionSource: "ESPN box score",
						resolutionMode: "system",
						locksAt: game.startsAt,
						generationKey: key,
						lossRate: defaultLossRate("team_vs_team", {}),
					})
					.returning()
				if (!inserted) {
					throw new Error(
						`syncGameQuestions: insert returned nothing for game ${game.id}`,
					)
				}

				await tx.insert(questionOptions).values([
					{
						questionId: inserted.id,
						label: gameWithTeams.awayTeam.name,
						sortOrder: 0,
						teamId: game.awayTeamId,
					},
					{
						questionId: inserted.id,
						label: gameWithTeams.homeTeam.name,
						sortOrder: 1,
						teamId: game.homeTeamId,
					},
				])
			}

			await refreshGeneratedQuestionSchedule(tx, gameWithTeams)
		})
	}
}
