import { LOSS_RATE_BY_SHAPE } from "@called-my-shot/scoring"
import { db } from "../../db"
import { RECURRING_QUESTION_CATALOG } from "../../db/catalog/recurring-question-catalog"
import {
	boundedLossRate,
	countHits,
	type HitCount,
	pooledHitRate,
	stepRate,
} from "./pooling"

// A single-pick title question's loss rate is where a pick on the best
// regular-season record in its pool breaks even. Measured on the finished
// season rather than when the question went up: title questions are posted
// before a game is played, when there's no record to pick from, and a call
// made that early already earns the bigger season-long early bonus for it.
// Each league only decides a few titles a year, so each league title leans on
// every other league's until its own record is large.
export const TITLE_TUNING = {
	// The fewest resolved titles, across every league, before any rate moves.
	minSample: 20,
	// The most recent resolved titles each league title's record is read over.
	window: 50,
	// How many results every other league title counts as while one league
	// title's own record is small - see pooledHitRate.
	poolWeight: 10,
	maxStep: 0.1,
	minRate: 0.05,
	maxRate: 1,
}

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

export function titleGroup(
	leagueSlug: string,
	awardName: string,
): TitleGroup | undefined {
	return titleGroups().find(
		(group) => group.leagueSlug === leagueSlug && group.awardName === awardName,
	)
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

	const recordsBySeason = new Map<string, Map<string, TeamRecord>>()
	const results = new Map<string, boolean[]>()
	for (const question of resolved) {
		if (!question.league || !question.awardName) continue
		let records = recordsBySeason.get(question.seasonId)
		if (!records) {
			records = recordsFrom(
				await db.query.games.findMany({
					where: {
						seasonId: question.seasonId,
						status: "final",
						seasonType: "regular",
					},
					columns: {
						homeTeamId: true,
						awayTeamId: true,
						homeScore: true,
						awayScore: true,
					},
				}),
			)
			recordsBySeason.set(question.seasonId, records)
		}
		const best = bestRecord(
			question.options.flatMap((option) =>
				option.teamId ? [option.teamId] : [],
			),
			records,
		)
		if (!best) continue
		const key = `${question.league.slug}:${question.awardName}`
		const list = results.get(key) ?? []
		if (list.length < TITLE_TUNING.window) {
			list.push(
				question.options.some(
					(option) => option.teamId === best && option.isCorrect === true,
				),
			)
		}
		results.set(key, list)
	}
	return results
}

// A league title's own record alone.
export function bestRecordHitRate(results: boolean[]): number | null {
	if (results.length === 0) return null
	return results.filter(Boolean).length / results.length
}

// A league title's record leaning on `pool` (every league title's results,
// its own included) until its own is large.
export function blendedTitleHitRate(
	results: boolean[],
	pool: HitCount,
): number | null {
	return pooledHitRate(countHits(results), pool, TITLE_TUNING.poolWeight)
}

export function suggestedTitleLossRate(hitRate: number | null): number | null {
	return boundedLossRate(hitRate, TITLE_TUNING.minRate, TITLE_TUNING.maxRate)
}

// The rate to move to from `current`, or null to leave it: too few resolved
// titles anywhere to go on, or already where the record points.
export function nextTitleLossRate(
	current: number,
	hitRate: number | null,
	poolTotal: number,
): number | null {
	if (poolTotal < TITLE_TUNING.minSample) return null
	return stepRate(
		current,
		suggestedTitleLossRate(hitRate),
		TITLE_TUNING.maxStep,
	)
}

// Real scored picks on resolved single-pick title questions for one league
// title. For comparison only, same as callerLeaderHits.
export async function callerTitleHits(
	leagueId: string,
	awardName: string,
): Promise<{ picks: number; hitRate: number | null }> {
	const rows = await db.query.callSelections.findMany({
		where: {
			resultPoints: { isNotNull: true },
			call: {
				question: {
					leagueId,
					awardName,
					picksRequired: 1,
					shape: "team_season_award",
					status: "resolved",
				},
			},
		},
		columns: { id: true },
		with: { option: { columns: { isCorrect: true } } },
	})
	const hits = rows.filter((row) => row.option?.isCorrect === true).length
	return {
		picks: rows.length,
		hitRate: rows.length === 0 ? null : hits / rows.length,
	}
}
