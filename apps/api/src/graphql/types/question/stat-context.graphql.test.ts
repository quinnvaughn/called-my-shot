import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { playerGameStats } from "../../../db/schema"
import {
	makeGame,
	makeLeague,
	makeOption,
	makePlayer,
	makeQuestion,
	makeSeason,
	makeStat,
	makeTeam,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"
import { daysAgo } from "../../../test/helpers"

const NOW = new Date("2026-09-12T12:00:00Z")
const daysBefore = (days: number) => daysAgo(days, NOW.getTime())

const QUERY = `
	query ($id: ID!) {
		question(id: $id) {
			statContext {
				statLabel
				lastN
				subjects {
					label
					recentGames { value didNotPlay isHome }
					seasonToDate { games mean overLine }
					home { games mean }
					away { games mean }
					rest { medianRestDays }
					opponentAllowed { meanAllowed positions }
					teamShare { sharePct }
				}
				matchup { focus }
			}
		}
	}
`

// Its own document rather than more fields on the one above, which would push
// matchup into every assertion up there that has nothing to do with it.
const MATCHUP_QUERY = `
	query ($id: ID!) {
		question(id: $id) {
			statContext {
				statLabel
				subjects { label }
				matchup {
					focus
					sides {
						label
						isHome
						differential { kind value games }
						overall { games wins losses ties overLine }
						inThisRole { games wins losses }
						streak { outcome length }
						restDays
						recentResults {
							outcome
							pointsFor
							pointsAgainst
							opponentAbbreviation
							isHome
						}
					}
					meetings { homeScore awayScore winnerTeamId }
				}
			}
		}
	}
`

type Split = { games: number; mean: number; overLine: number | null }
type Result = {
	statContext: {
		statLabel: string
		lastN: number
		subjects: {
			label: string
			recentGames: { value: number | null; didNotPlay: boolean }[]
			seasonToDate: Split | null
			home: Split | null
			away: Split | null
			rest: { medianRestDays: number } | null
			opponentAllowed: { meanAllowed: number; positions: string[] } | null
			teamShare: { sharePct: number } | null
		}[]
		matchup: { focus: string } | null
	} | null
}

type Record = {
	games: number
	wins: number
	losses: number
	ties: number
	overLine: number | null
}
type MatchupResult = {
	statContext: {
		statLabel: string
		subjects: { label: string }[]
		matchup: {
			focus: string
			sides: {
				label: string
				isHome: boolean
				differential: { kind: string; value: number; games: number } | null
				overall: Record | null
				inThisRole: Pick<Record, "games" | "wins" | "losses"> | null
				streak: { outcome: string; length: number } | null
				restDays: number | null
				recentResults: {
					outcome: string
					pointsFor: number
					pointsAgainst: number
					opponentAbbreviation: string
					isHome: boolean
				}[]
			}[]
			meetings: {
				homeScore: number
				awayScore: number
				winnerTeamId: string | null
			}[]
		} | null
	} | null
}

async function seed() {
	const league = await makeLeague({ slug: "nba" })
	const season = await makeSeason({ leagueId: league.id })
	const team = await makeTeam({ leagueId: league.id })
	const opponent = await makeTeam({ leagueId: league.id })
	const stat = await makeStat({ sportId: league.sportId, name: "Points" })
	const game = await makeGame({
		leagueId: league.id,
		seasonId: season.id,
		homeTeamId: team.id,
		awayTeamId: opponent.id,
		startsAt: NOW,
	})
	return { league, season, team, opponent, stat, game }
}

type World = Awaited<ReturnType<typeof seed>>

async function playedGame(
	world: World,
	playerId: string,
	value: number,
	days: number,
) {
	const past = await makeGame({
		leagueId: world.league.id,
		seasonId: world.season.id,
		homeTeamId: world.team.id,
		awayTeamId: world.opponent.id,
		startsAt: daysBefore(days),
		status: "final",
	})
	await db.insert(playerGameStats).values({
		gameId: past.id,
		source: "espn",
		sourceAthleteId: `nba:${playerId}:${days}`,
		playerId,
		teamId: world.team.id,
		opponentTeamId: world.opponent.id,
		isHome: true,
		gameDate: daysBefore(days),
		seasonId: world.season.id,
		leagueId: world.league.id,
		statKey: "points",
		valueText: String(value),
		valueNumeric: value,
		didNotPlay: false,
	})
}

const ask = (id: string) =>
	expectData<{ question: Result | null }>(QUERY, { variables: { id } })

const askMatchup = (id: string) =>
	expectData<{ question: MatchupResult | null }>(MATCHUP_QUERY, {
		variables: { id },
	})

describe("Question.statContext", () => {
	it("returns the cards for a one-sided question", async () => {
		const world = await seed()
		const player = await makePlayer({
			currentTeamId: world.team.id,
			positions: ["SG"],
		})
		await playedGame(world, player.id, 30, 5)
		await playedGame(world, player.id, 20, 3)

		const question = await makeQuestion({
			shape: "player_stat_over_under",
			leagueId: world.league.id,
			sportId: world.league.sportId,
			seasonId: world.season.id,
			gameId: world.game.id,
			statId: world.stat.id,
			subjectPlayerId: player.id,
			ouLine: 22.5,
			locksAt: NOW,
		})

		const { question: row } = await ask(question.id)
		const context = row?.statContext

		expect(context?.statLabel).toBe("Points")
		expect(context?.subjects).toHaveLength(1)
		expect(context?.matchup).toBeNull()
		expect(context?.subjects[0]?.recentGames.map((g) => g.value)).toEqual([
			20, 30,
		])
		// One of the two cleared 22.5.
		expect(context?.subjects[0]?.seasonToDate?.overLine).toBe(1)
	})

	it("returns both sides of a head-to-head", async () => {
		const world = await seed()
		const a = await makePlayer({ currentTeamId: world.team.id })
		const b = await makePlayer({ currentTeamId: world.opponent.id })
		await playedGame(world, a.id, 30, 5)
		await playedGame(world, b.id, 12, 4)

		const question = await makeQuestion({
			shape: "player_vs_player",
			leagueId: world.league.id,
			sportId: world.league.sportId,
			seasonId: world.season.id,
			gameId: world.game.id,
			statId: world.stat.id,
			locksAt: NOW,
		})
		await makeOption(question.id, { label: "A", sortOrder: 0, playerId: a.id })
		await makeOption(question.id, { label: "B", sortOrder: 1, playerId: b.id })

		const { question: row } = await ask(question.id)

		expect(row?.statContext?.subjects.map((s) => s.label)).toEqual(["A", "B"])
	})

	// DefaultFieldNullability is false, so a question with nothing to show has
	// to come back as a null field rather than a field error taking the whole
	// Question down.
	it("is null for a custom stat", async () => {
		const world = await seed()
		const player = await makePlayer({ currentTeamId: world.team.id })
		await playedGame(world, player.id, 30, 5)

		const question = await makeQuestion({
			shape: "player_stat_over_under",
			leagueId: world.league.id,
			sportId: world.league.sportId,
			seasonId: world.season.id,
			gameId: world.game.id,
			statId: null,
			customStat: "vibes",
			subjectPlayerId: player.id,
			locksAt: NOW,
		})

		const { question: row } = await ask(question.id)
		expect(row?.statContext).toBeNull()
	})

	it("is null for a subject with no stored history", async () => {
		const world = await seed()
		const player = await makePlayer({ currentTeamId: world.team.id })

		const question = await makeQuestion({
			shape: "player_stat_over_under",
			leagueId: world.league.id,
			sportId: world.league.sportId,
			seasonId: world.season.id,
			gameId: world.game.id,
			statId: world.stat.id,
			subjectPlayerId: player.id,
			ouLine: 22.5,
			locksAt: NOW,
		})

		const { question: row } = await ask(question.id)
		expect(row?.statContext).toBeNull()
	})
})

describe("Question.statContext for a game-level question", () => {
	// A finished game with a scoreboard, for building records off.
	const finished = async (
		world: World,
		options: {
			days: number
			homeTeamId?: string
			awayTeamId?: string
			homeScore: number
			awayScore: number
		},
	) =>
		makeGame({
			leagueId: world.league.id,
			seasonId: world.season.id,
			homeTeamId: options.homeTeamId ?? world.team.id,
			awayTeamId: options.awayTeamId ?? world.opponent.id,
			startsAt: daysBefore(options.days),
			status: "final",
			homeScore: options.homeScore,
			awayScore: options.awayScore,
		})

	const whoWins = async (world: World) =>
		makeQuestion({
			shape: "team_vs_team",
			leagueId: world.league.id,
			sportId: world.league.sportId,
			seasonId: world.season.id,
			gameId: world.game.id,
			// The whole point of the shape: no stat to read a column from.
			statId: null,
			locksAt: NOW,
		})

	it("returns a matchup for a team-vs-team question, which has no stat", async () => {
		const world = await seed()
		await finished(world, { days: 7, homeScore: 30, awayScore: 20 })
		await finished(world, { days: 3, homeScore: 21, awayScore: 24 })

		const question = await whoWins(world)
		const { question: row } = await askMatchup(question.id)
		const matchup = row?.statContext?.matchup

		expect(row?.statContext?.statLabel).toBe("")
		expect(row?.statContext?.subjects).toEqual([])
		expect(matchup?.focus).toBe("WINNER")
		expect(matchup?.sides).toHaveLength(2)
		expect(matchup?.sides[0]?.overall).toMatchObject({ games: 2, wins: 1 })
		// No line on a who-wins question, so nothing to have cleared.
		expect(matchup?.sides[0]?.overall?.overLine).toBeNull()
	})

	it("orders the columns the way the question lists its options", async () => {
		const world = await seed()
		await finished(world, { days: 7, homeScore: 30, awayScore: 20 })

		const question = await whoWins(world)
		await makeOption(question.id, {
			label: "Away",
			sortOrder: 0,
			teamId: world.opponent.id,
		})
		await makeOption(question.id, {
			label: "Home",
			sortOrder: 1,
			teamId: world.team.id,
		})

		const { question: row } = await askMatchup(question.id)

		expect(row?.statContext?.matchup?.sides.map((s) => s.label)).toEqual([
			"Away",
			"Home",
		])
		expect(row?.statContext?.matchup?.sides.map((s) => s.isHome)).toEqual([
			false,
			true,
		])
	})

	// The page's team map holds only this game's two teams, so a strip that
	// ran through an earlier opponent could not name it without this.
	it("names the opponent of each game in the results strip", async () => {
		const world = await seed()
		const other = await makeTeam({ leagueId: world.league.id })
		await finished(world, {
			days: 7,
			awayTeamId: other.id,
			homeScore: 30,
			awayScore: 20,
		})
		await finished(world, {
			days: 3,
			homeTeamId: other.id,
			awayTeamId: world.opponent.id,
			homeScore: 10,
			awayScore: 14,
		})

		const question = await whoWins(world)
		const { question: row } = await askMatchup(question.id)
		const [ours] = row?.statContext?.matchup?.sides ?? []

		expect(ours?.recentResults[0]).toMatchObject({
			outcome: "WIN",
			pointsFor: 30,
			pointsAgainst: 20,
			opponentAbbreviation: other.abbreviation,
			isHome: true,
		})
	})

	it("leads with scoring for a game total and counts what cleared the line", async () => {
		const world = await seed()
		const other = await makeTeam({ leagueId: world.league.id })
		await finished(world, {
			days: 7,
			awayTeamId: other.id,
			homeScore: 30,
			awayScore: 20,
		})
		await finished(world, {
			days: 3,
			homeTeamId: other.id,
			awayTeamId: world.opponent.id,
			homeScore: 10,
			awayScore: 14,
		})

		const question = await makeQuestion({
			shape: "game_total_over_under",
			leagueId: world.league.id,
			sportId: world.league.sportId,
			seasonId: world.season.id,
			gameId: world.game.id,
			statId: world.stat.id,
			ouLine: 44.5,
			locksAt: NOW,
		})

		const { question: row } = await askMatchup(question.id)
		const matchup = row?.statContext?.matchup

		expect(matchup?.focus).toBe("SCORING")
		// 50 cleared 44.5; the other side's 24 did not.
		expect(matchup?.sides[0]?.overall?.overLine).toBe(1)
		expect(matchup?.sides[1]?.overall?.overLine).toBe(0)
	})

	// Same rule as a head-to-head: both sides or neither.
	it("is null when neither team has finished a game", async () => {
		const world = await seed()
		const question = await whoWins(world)

		const { question: row } = await askMatchup(question.id)
		expect(row?.statContext).toBeNull()
	})

	it("is null for a team-vs-team question with no game", async () => {
		const world = await seed()
		await finished(world, { days: 7, homeScore: 30, awayScore: 20 })

		const question = await makeQuestion({
			shape: "team_vs_team",
			leagueId: world.league.id,
			sportId: world.league.sportId,
			seasonId: world.season.id,
			gameId: null,
			statId: null,
			locksAt: NOW,
		})

		const { question: row } = await askMatchup(question.id)
		expect(row?.statContext).toBeNull()
	})
})
