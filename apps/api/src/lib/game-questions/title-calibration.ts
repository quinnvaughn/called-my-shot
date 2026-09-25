import { LOSS_RATE_BY_SHAPE } from "@called-my-shot/scoring"
import { db } from "../../db"
import { RECURRING_QUESTION_CATALOG } from "../../db/catalog/recurring-question-catalog"
import { lossRateTuner, pushWithin } from "./pooling"

// A single-pick title question's loss rate is where a pick on the best
// regular-season record in its pool clears PLAYER_EDGE. Measured on the
// finished season rather than when the question went up: title questions are posted
// before a game is played, when there's no record to pick from, and a call
// made that early already earns the bigger season-long early bonus for it.
// Each league only decides a few titles a year, so each league title leans on
// every other league's until its own record is large.
export const TITLE_TUNING = {
	minSample: 20,
	window: 50,
	poolWeight: 10,
	maxStep: 0.1,
	minRate: 0.05,
	maxRate: 1,
}

export const titleRates = lossRateTuner(TITLE_TUNING)

export const DEFAULT_TITLE_LOSS_RATE = LOSS_RATE_BY_SHAPE.team_season_award

// One league's title, by award name - AL and NL pennants share a rate, the
// way they share an award name.
export type TitleGroup = { leagueSlug: string; awardName: string }

export function titleGroups(): TitleGroup[] {
	const groups: TitleGroup[] = []
	for (const [leagueSlug, templates] of Object.entries(
		RECURRING_QUESTION_CATALOG,
	)) {
		for (const template of templates) {
			if (template.shape !== "team_season_award") continue
			if (template.picksRequired !== 1) continue
			const seen = groups.some(
				(group) =>
					group.leagueSlug === leagueSlug &&
					group.awardName === template.awardName,
			)
			if (!seen) groups.push({ leagueSlug, awardName: template.awardName })
		}
	}
	return groups
}

type TeamRecord = { wins: number; games: number }

type FinalGame = {
	homeTeamId: string
	awayTeamId: string
	homeScore: number | null
	awayScore: number | null
}

// Each team's record from its final games. A tie counts as half a win.
export function recordsFrom(games: FinalGame[]): Map<string, TeamRecord> {
	const records = new Map<string, TeamRecord>()
	const add = (teamId: string, wins: number) => {
		const record = records.get(teamId) ?? { wins: 0, games: 0 }
		records.set(teamId, { wins: record.wins + wins, games: record.games + 1 })
	}
	for (const game of games) {
		if (game.homeScore === null || game.awayScore === null) continue
		const homeWins =
			game.homeScore > game.awayScore
				? 1
				: game.homeScore === game.awayScore
					? 0.5
					: 0
		add(game.homeTeamId, homeWins)
		add(game.awayTeamId, 1 - homeWins)
	}
	return records
}

// The team among `teamIds` with the best share of wins, the first listed on a
// tie. Null when none of them played.
export function bestRecord(
	teamIds: string[],
	records: Map<string, TeamRecord>,
): string | null {
	let best: { teamId: string; share: number } | null = null
	for (const teamId of teamIds) {
		const record = records.get(teamId)
		if (!record || record.games === 0) continue
		const share = record.wins / record.games
		if (!best || share > best.share) best = { teamId, share }
	}
	return best?.teamId ?? null
}

// Whether the best regular-season record in each resolved single-pick title
// question's pool won it, most recent first, by "<league>:<award>". A season
// with no final regular-season games to read doesn't count.
export async function bestRecordResultsByGroup(): Promise<
	Map<string, boolean[]>
> {
	const resolved = await db.query.questions.findMany({
		where: {
			shape: "team_season_award",
			status: "resolved",
			picksRequired: 1,
		},
		columns: { seasonId: true, awardName: true },
		with: {
			league: { columns: { slug: true } },
			options: { columns: { teamId: true, isCorrect: true } },
		},
		orderBy: { locksAt: "desc" },
	})
	const seasonIds = [...new Set(resolved.map((q) => q.seasonId))]
	const finals =
		seasonIds.length === 0
			? []
			: await db.query.games.findMany({
					where: {
						seasonId: { in: seasonIds },
						status: "final",
						seasonType: "regular",
					},
					columns: {
						seasonId: true,
						homeTeamId: true,
						awayTeamId: true,
						homeScore: true,
						awayScore: true,
					},
				})
	const recordsBySeason = new Map(
		seasonIds.map((seasonId) => [
			seasonId,
			recordsFrom(finals.filter((game) => game.seasonId === seasonId)),
		]),
	)

	const results = new Map<string, boolean[]>()
	for (const question of resolved) {
		if (!question.league || !question.awardName) continue
		const best = bestRecord(
			question.options.flatMap((option) =>
				option.teamId ? [option.teamId] : [],
			),
			recordsBySeason.get(question.seasonId) ?? new Map(),
		)
		if (!best) continue
		pushWithin(
			results,
			`${question.league.slug}:${question.awardName}`,
			question.options.some(
				(option) => option.teamId === best && option.isCorrect === true,
			),
			TITLE_TUNING.window,
		)
	}
	return results
}
