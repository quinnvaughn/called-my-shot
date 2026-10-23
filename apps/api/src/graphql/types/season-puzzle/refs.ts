import { db } from "../../../db"
import type { Team, TeamSeason } from "../../../db/schema"
import { nextArcadeDayAt } from "../../../lib/arcade/day"
import {
	type LoadedSeasonPuzzle,
	type SeasonPlayView,
	verifiedSharer,
} from "../../../lib/season-puzzles/load"
import {
	type SeasonGuessDirection,
	type SeasonGuessOutcome,
	seasonGuessCount,
	seasonKey,
} from "../../../lib/season-puzzles/play"
import type { SeasonStats } from "../../../lib/season-puzzles/stats"
import { builder } from "../../builder"
import { LeagueRef, TeamRef } from "../sports"
import { UserRef } from "../user"

export const SeasonPlayStatusEnum = builder.enumType("SeasonPuzzleStatus", {
	values: {
		PLAYING: { value: "playing" },
		SOLVED: { value: "solved" },
		MISSED: { value: "missed" },
	} as const,
})

export const SeasonGuessOutcomeEnum = builder.enumType("SeasonPuzzleOutcome", {
	values: {
		HIT: { value: "hit" },
		// The right franchise in the wrong season.
		CLOSE: { value: "close" },
		MISS: { value: "miss" },
	} as const,
})

export const SeasonGuessDirectionEnum = builder.enumType(
	"SeasonPuzzleDirection",
	{
		values: {
			EARLIER: { value: "earlier" },
			LATER: { value: "later" },
		} as const,
	},
)

export const SeasonGuessInputRef = builder.inputType("SeasonPuzzleGuessInput", {
	fields: (t) => ({
		teamId: t.id({ required: true }),
		year: t.int({ required: true }),
	}),
})

async function loadTeam(teamId: string): Promise<Team> {
	const team = await db.query.teams.findFirst({ where: { id: teamId } })
	if (!team) throw new Error(`team ${teamId} missing`)
	return team
}

async function loadLeague(leagueId: string) {
	const league = await db.query.leagues.findFirst({ where: { id: leagueId } })
	if (!league) throw new Error(`league ${leagueId} missing`)
	return league
}

// One franchise's season: "1995-96", "Seattle SuperSonics", with today's
// franchise for its logo and colors.
export const TeamSeasonRef = builder
	.objectRef<TeamSeason>("TeamSeason")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			year: t.exposeInt("year"),
			label: t.exposeString("label"),
			// What the team was called that season.
			name: t.exposeString("name"),
			team: t.field({ type: TeamRef, resolve: (s) => loadTeam(s.teamId) }),
		}),
	})

type GuessRow = {
	team: Team
	season: TeamSeason | null
	year: number
	outcome: SeasonGuessOutcome
	direction: SeasonGuessDirection | null
}

const SeasonGuessRef = builder
	.objectRef<GuessRow>("SeasonPuzzleGuess")
	.implement({
		fields: (t) => ({
			team: t.field({ type: TeamRef, resolve: (g) => g.team }),
			year: t.exposeInt("year"),
			label: t.string({ resolve: (g) => g.season?.label ?? String(g.year) }),
			// The franchise's name that season.
			name: t.string({ resolve: (g) => g.season?.name ?? g.team.name }),
			outcome: t.field({
				type: SeasonGuessOutcomeEnum,
				resolve: (g) => g.outcome,
			}),
			// Which way the answer's season is. Null when the year was right.
			direction: t.field({
				type: SeasonGuessDirectionEnum,
				nullable: true,
				resolve: (g) => g.direction,
			}),
		}),
	})

// One player's game on one puzzle: what they've guessed, the clues they've
// earned, and the answer once it's over.
export const SeasonPlayRef = builder
	.objectRef<SeasonPlayView>("SeasonPuzzlePlay")
	.implement({
		fields: (t) => ({
			status: t.field({
				type: SeasonPlayStatusEnum,
				resolve: (view) => view.state.status,
			}),
			guesses: t.field({
				type: [SeasonGuessRef],
				resolve: (view) =>
					view.state.guesses.flatMap((g) => {
						const team = view.teamsById.get(g.teamId)
						if (!team) return []
						return [
							{
								team,
								season: view.seasonsByKey.get(seasonKey(g)) ?? null,
								year: g.year,
								outcome: g.outcome,
								direction: g.direction,
							},
						]
					}),
			}),
			// Clue 1 to start, one more per wrong guess, all six once it's over.
			clues: t.stringList({ resolve: (view) => view.state.clues }),
			// Null until the game is over.
			answer: t.field({
				type: TeamSeasonRef,
				nullable: true,
				resolve: (view) => (view.state.over ? view.puzzle.teamSeason : null),
			}),
			// Guesses it took, null for a miss or a game still going.
			guessCount: t.int({
				nullable: true,
				resolve: (view) => seasonGuessCount(view.state),
			}),
		}),
	})

// A scheduled puzzle as players see it: its day and league. Never carries
// the answer or the clues; those come through SeasonPuzzlePlay, as they're
// earned.
export const SeasonPuzzleRef = builder
	.objectRef<LoadedSeasonPuzzle>("SeasonPuzzle")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			date: t.exposeString("playDate"),
			league: t.field({
				type: LeagueRef,
				resolve: (p) => loadLeague(p.teamSeason.leagueId),
			}),
			nextPuzzleAt: t.field({
				type: "DateTime",
				resolve: () => nextArcadeDayAt(new Date()),
			}),
		}),
	})

// A puzzle as a share link shows it: the answer only once its day is over.
export const SeasonShareRef = builder
	.objectRef<{ puzzle: LoadedSeasonPuzzle; revealed: boolean }>(
		"SeasonPuzzleShare",
	)
	.implement({
		fields: (t) => ({
			date: t.string({ resolve: (s) => s.puzzle.playDate }),
			league: t.field({
				type: LeagueRef,
				resolve: (s) => loadLeague(s.puzzle.teamSeason.leagueId),
			}),
			answer: t.field({
				type: TeamSeasonRef,
				nullable: true,
				resolve: (s) => (s.revealed ? s.puzzle.teamSeason : null),
			}),
			// Who a shared link says played it (its ?by=), only when the
			// link's squares are that player's real result.
			sharer: t.field({
				type: UserRef,
				nullable: true,
				args: {
					username: t.arg.string({ required: true }),
					result: t.arg.string({ required: true }),
				},
				resolve: (s, args) =>
					verifiedSharer(s.puzzle, args.username, args.result),
			}),
		}),
	})

export const SeasonStatsRef = builder
	.objectRef<SeasonStats>("SeasonPuzzleStats")
	.implement({
		fields: (t) => ({
			played: t.exposeInt("played"),
			solved: t.exposeInt("solved"),
			missed: t.exposeInt("missed"),
			// Index 0 is solved in 1, index 5 solved in 6.
			distribution: t.exposeIntList("distribution"),
			currentStreak: t.exposeInt("currentStreak"),
			bestStreak: t.exposeInt("bestStreak"),
		}),
	})

export type FranchiseOption = {
	team: Team
	seasons: { year: number; label: string }[]
	// What else the franchise has been called, so a search for "Oilers"
	// finds the Titans.
	formerNames: string[]
}

const SeasonOptionRef = builder
	.objectRef<{ year: number; label: string }>("SeasonPuzzleYear")
	.implement({
		fields: (t) => ({
			year: t.exposeInt("year"),
			label: t.exposeString("label"),
		}),
	})

export const FranchiseOptionRef = builder
	.objectRef<FranchiseOption>("FranchiseOption")
	.implement({
		fields: (t) => ({
			team: t.field({ type: TeamRef, resolve: (f) => f.team }),
			// Oldest first.
			seasons: t.field({ type: [SeasonOptionRef], resolve: (f) => f.seasons }),
			formerNames: t.exposeStringList("formerNames"),
		}),
	})
