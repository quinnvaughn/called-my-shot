import { generateQuestionTitle } from "@called-my-shot/schemas"
import { eq } from "drizzle-orm"
import { DateTime } from "luxon"
import { getOfficialAccountId } from "../../lib/official-account"
import { db } from "../index"
import { type League, questionOptions, questions } from "../schema"

// How far out a game's question gets created ahead of the game itself.
// ESPN publishes a full season's schedule (~1,230 games for the NBA) the
// moment it's set, so without a cap every game would get its question the
// same day the schedule drops - flooding the "New" feed sort with months of
// far-future games all sharing one createdAt, burying the ones that
// actually matter right now under ones nobody can act on yet. Paced instead:
// a game only gets its question once it's within this window, so creation
// spreads out day by day as the cron keeps running and games enter it.
const CREATE_WINDOW = { weeks: 3 }

// One team_vs_team question per synced game, created official (see
// ADMIN_ONLY_SHAPES in packages/schemas/src/questions.ts - team_vs_team is
// derived 1:1 from a game, so a regular creator posting one risks a
// duplicate matchup question; the sync job is the only thing that should
// create these). Most runs touch nothing: a game only needs its question
// created once. What does recur is ESPN moving a game's startsAt (a flex, a
// rain delay reschedule) after its question already exists - that's synced
// into locksAt (and the title, since its "(Oct 20)" suffix is derived from
// the same date) so the lock time never drifts from the real game.
//
// Requires syncGames(config, league) to have already run for this league.
export async function syncGameQuestions(league: League): Promise<void> {
	const officialAccountId = await getOfficialAccountId()
	const allLeagueGames = await db.query.games.findMany({
		where: { leagueId: league.id },
		with: { homeTeam: true, awayTeam: true },
	})

	// Bounded both directions. Lower: skip anything that's already tipped
	// off - there was never a window to call it, so a question for it would
	// only ever be poseable after the fact. Ordinarily this is a non-issue (a
	// game's question gets created while the game is still upcoming, well
	// before this job would ever see it as past), but it matters a lot on a
	// league's very first sync: ESPN's regular-season schedule endpoint
	// returns whichever season it currently considers "current," which
	// during the off-season before the new season's schedule is published is
	// still last season's full slate - hundreds of already-finished games
	// syncGames just backfilled that have no business getting a question
	// now. Upper: see CREATE_WINDOW above.
	const now = new Date()
	const horizon = DateTime.now().plus(CREATE_WINDOW).toJSDate()
	// Descending: within a batch, each insert's createdAt lands a little
	// later than the previous one (sequential round trips, same as any
	// other loop of individual writes), and the NEW feed sort is createdAt
	// descending - so processing the farthest-out game first and the
	// soonest-starting one last means the soonest game ends up with the
	// newest createdAt and lands at the top, with the rest of the batch
	// falling in behind it in the same order they actually kick off.
	const leagueGames = allLeagueGames
		.filter((game) => game.startsAt >= now && game.startsAt <= horizon)
		.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())

	for (const game of leagueGames) {
		// homeTeamId/awayTeamId are NOT NULL - drizzle just types every `one`
		// relation as nullable regardless of the FK's own nullability, same
		// non-issue documented at length in loadGameWithTeams in
		// graphql/types/question.ts.
		if (!game.homeTeam || !game.awayTeam) {
			throw new Error(
				`syncGameQuestions: game ${game.id} is missing its home/away team`,
			)
		}
		const homeTeam = game.homeTeam
		const awayTeam = game.awayTeam

		const title = generateQuestionTitle({
			shape: "team_vs_team",
			awayTeamName: awayTeam.name,
			homeTeamName: homeTeam.name,
			gameDate: game.startsAt.toISOString(),
		})

		await db.transaction(async (tx) => {
			const existing = await tx.query.questions.findFirst({
				where: { gameId: game.id, shape: "team_vs_team" },
			})

			if (existing) {
				// Never touch a question once it's resolved/disputed - it already
				// has a real-world result attached, so a late ESPN schedule
				// correction shouldn't retroactively change what it says.
				const locksAtChanged =
					existing.locksAt.getTime() !== game.startsAt.getTime()
				if (
					(existing.status === "open" || existing.status === "locked") &&
					(locksAtChanged || existing.title !== title)
				) {
					await tx
						.update(questions)
						.set({ locksAt: game.startsAt, title })
						.where(eq(questions.id, existing.id))
				}
				return
			}

			const [inserted] = await tx
				.insert(questions)
				.values({
					shape: "team_vs_team",
					title,
					creatorId: officialAccountId,
					isOfficial: true,
					sportId: league.sportId,
					leagueId: league.id,
					gameId: game.id,
					seasonId: game.seasonId,
					resolutionSource: "ESPN box score",
					locksAt: game.startsAt,
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
					label: awayTeam.name,
					sortOrder: 0,
					teamId: game.awayTeamId,
				},
				{
					questionId: inserted.id,
					label: homeTeam.name,
					sortOrder: 1,
					teamId: game.homeTeamId,
				},
			])
		})
	}
}
