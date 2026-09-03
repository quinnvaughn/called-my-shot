import { db } from "../db"
import type { Player, Team } from "../db/schema"

// Extracted from createQuestion's inline awardPlayerPool/awardTeamPool
// (graphql/types/question.ts) so the same pool-building logic can be reused
// beyond player_season_award/team_season_award - specifically by
// player_game_stat_leader (scoped to a game's two teams, not a whole league)
// and by the recurring season-question engine (lib/season-questions.ts).
// { leagueId } reproduces the original whole-league query exactly; { teamIds }
// is the new scope, used when the pool is just the two teams in one game.

type PlayerPoolScope = { leagueId: string } | { teamIds: string[] }

export async function buildPlayerPool(
	scope: PlayerPoolScope,
	filters: {
		conferences?: string[] | null
		divisions?: string[] | null
		positions?: string[] | null
		seasonsInLeague?: number[] | null
		rookieOnly?: boolean | null
	} = {},
): Promise<Player[]> {
	return db.query.players.findMany({
		where: {
			currentTeam:
				"leagueId" in scope
					? {
							leagueId: scope.leagueId,
							...(filters.conferences?.length
								? { conference: { in: filters.conferences } }
								: {}),
							...(filters.divisions?.length
								? { division: { in: filters.divisions } }
								: {}),
						}
					: undefined,
			...("teamIds" in scope ? { currentTeamId: { in: scope.teamIds } } : {}),
			...(filters.positions?.length
				? { positions: { arrayOverlaps: filters.positions } }
				: {}),
			...(filters.seasonsInLeague?.length
				? { seasonsInLeague: { in: filters.seasonsInLeague } }
				: {}),
			...(filters.rookieOnly ? { rookieEligible: true } : {}),
		},
	})
}

export async function buildTeamPool(
	scope: { leagueId: string },
	filters: { conferences?: string[] | null; divisions?: string[] | null } = {},
): Promise<Team[]> {
	return db.query.teams.findMany({
		where: {
			leagueId: scope.leagueId,
			...(filters.conferences?.length
				? { conference: { in: filters.conferences } }
				: {}),
			...(filters.divisions?.length
				? { division: { in: filters.divisions } }
				: {}),
		},
	})
}
