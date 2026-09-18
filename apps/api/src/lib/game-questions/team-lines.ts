import { db } from "../../db"
import type { SeasonSample } from "./lines"

// Where a generated team over/under's line comes from: the team's own final
// scores, read straight off the games table rather than from ESPN. A team
// numeric guess is already graded against games.homeScore/awayScore (see
// lib/auto-resolve/decide.ts), so the same column that settles the question
// is the one its line is set from.

// One league season's final scores per team, keyed by team id.
export type TeamScores = Map<string, number[]>

type FinalGame = {
	homeTeamId: string
	awayTeamId: string
	homeScore: number | null
	awayScore: number | null
}

export function scoresByTeam(games: FinalGame[]): TeamScores {
	const scores: TeamScores = new Map()
	for (const game of games) {
		if (game.homeScore === null || game.awayScore === null) continue
		for (const [teamId, score] of [
			[game.homeTeamId, game.homeScore],
			[game.awayTeamId, game.awayScore],
		] as const) {
			const prior = scores.get(teamId) ?? []
			prior.push(score)
			scores.set(teamId, prior)
		}
	}
	return scores
}

export function sampleOf(scores: number[] | undefined): SeasonSample | null {
	if (!scores || scores.length === 0) return null
	const total = scores.reduce((sum, score) => sum + score, 0)
	return { mean: total / scores.length, games: scores.length }
}

// One fetch per league season per run, however many games ask for it. A
// season nothing has finished yet caches as an empty map, same as no season.
export function createTeamScoreCache(leagueId: string) {
	const cache = new Map<number, Promise<TeamScores>>()
	const load = async (year: number): Promise<TeamScores> => {
		const season = await db.query.seasons.findFirst({
			where: { leagueId, year },
			columns: { id: true },
		})
		if (!season) return new Map()
		const finals = await db.query.games.findMany({
			where: { seasonId: season.id, status: "final" },
			columns: {
				homeTeamId: true,
				awayTeamId: true,
				homeScore: true,
				awayScore: true,
			},
		})
		return scoresByTeam(finals)
	}
	return async (teamId: string, year: number, priorWeight: number) => {
		const current = cache.get(year) ?? load(year)
		cache.set(year, current)
		const season = sampleOf((await current).get(teamId))
		// Last season is only read while this one is short of priorWeight
		// games, the same cutoff a player line uses (see needsPriorSeason).
		if ((season?.games ?? 0) >= priorWeight) return { season, prior: null }
		const previous = cache.get(year - 1) ?? load(year - 1)
		cache.set(year - 1, previous)
		return { season, prior: sampleOf((await previous).get(teamId)) }
	}
}
