import type { Game } from "../../db/schema"

// What ESPN's note on a postseason game says about it: "NLDS - Game 4",
// "First Round - Game 3 If Necessary", or a single-game round's bare name
// ("AFC Wild Card Playoffs"). Only ever read for a postseason game - the
// regular season's notes ("Doubleheader - Game 1 - Makeup from May 20") use
// the same "- Game N" wording for something else entirely.
export type PostseasonNote = {
	round: string
	gameNumber: number | null
	ifNecessary: boolean
}

const SERIES_GAME = /^(.+?)\s+-\s+Game\s+(\d+)\b/i
const IF_NECESSARY = /\bif necessary\b/i

export function parsePostseasonNote(
	headline: string | undefined,
): PostseasonNote | null {
	const text = headline?.trim()
	if (!text) return null
	const ifNecessary = IF_NECESSARY.test(text)
	const series = SERIES_GAME.exec(text)
	if (series?.[1] && series[2]) {
		return {
			round: series[1].trim(),
			gameNumber: Number(series[2]),
			ifNecessary,
		}
	}
	return {
		round: text.replace(IF_NECESSARY, "").trim(),
		gameNumber: null,
		ifNecessary,
	}
}

// ESPN abbreviates MLB's Wild Card round in its notes; every other round name
// it uses already reads as the name fans know it by.
const ROUND_LABELS: Record<string, string> = {
	ALWC: "AL Wild Card Series",
	NLWC: "NL Wild Card Series",
}

export function roundLabel(round: string): string {
	return ROUND_LABELS[round] ?? round
}

// The pair of teams a series is filed under, in id order - see
// postseasonSeries.teamAId.
export function seriesTeamPair(
	homeTeamId: string,
	awayTeamId: string,
): [string, string] {
	return homeTeamId < awayTeamId
		? [homeTeamId, awayTeamId]
		: [awayTeamId, homeTeamId]
}

export function winsNeeded(bestOf: number): number {
	return Math.floor(bestOf / 2) + 1
}

export type SeriesGame = Pick<
	Game,
	| "id"
	| "status"
	| "homeTeamId"
	| "awayTeamId"
	| "homeScore"
	| "awayScore"
	| "seriesGameNumber"
	| "ifNecessary"
	| "startsAt"
>

function gameWinner(game: SeriesGame): string | null {
	if (
		game.status !== "final" ||
		game.homeScore === null ||
		game.awayScore === null ||
		game.homeScore === game.awayScore
	) {
		return null
	}
	return game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId
}

// Each team's wins across the series' final games numbered below
// `beforeGame`, or all of them when it's omitted.
export function seriesWins(
	games: SeriesGame[],
	beforeGame?: number,
): Map<string, number> {
	const wins = new Map<string, number>()
	for (const game of games) {
		if (
			beforeGame !== undefined &&
			(game.seriesGameNumber ?? Number.POSITIVE_INFINITY) >= beforeGame
		) {
			continue
		}
		const winner = gameWinner(game)
		if (winner) wins.set(winner, (wins.get(winner) ?? 0) + 1)
	}
	return wins
}

export function seriesWinner(
	games: SeriesGame[],
	bestOf: number | null,
	beforeGame?: number,
): string | null {
	if (!bestOf) return null
	const need = winsNeeded(bestOf)
	for (const [teamId, wins] of seriesWins(games, beforeGame)) {
		if (wins >= need) return teamId
	}
	return null
}

// Whether a game will actually be played. Nothing past the game that won the
// series is. Past that, anything ESPN doesn't flag "If Necessary" is, and a
// flagged one is once every game ahead of it is final and nobody has won the
// series - until then it might never happen, so nothing should be asked
// about it.
export function isGameConfirmed(
	game: Pick<SeriesGame, "ifNecessary" | "seriesGameNumber">,
	seriesGames: SeriesGame[],
	bestOf: number | null,
): boolean {
	const number = game.seriesGameNumber
	if (number !== null && seriesWinner(seriesGames, bestOf, number)) {
		return false
	}
	if (!game.ifNecessary) return true
	if (number === null || !bestOf) return false
	const earlier = seriesGames.filter(
		(g) => g.seriesGameNumber !== null && g.seriesGameNumber < number,
	)
	if (earlier.length < number - 1) return false
	if (earlier.some((g) => g.status !== "final")) return false
	return seriesWinner(seriesGames, bestOf, number) === null
}

// The games a decided series will never play: everything not yet final
// numbered past the game that won it.
export function unplayedGames(
	games: SeriesGame[],
	bestOf: number | null,
): SeriesGame[] {
	if (!seriesWinner(games, bestOf)) return []
	const lastFinal = Math.max(
		0,
		...games
			.filter((g) => g.status === "final")
			.map((g) => g.seriesGameNumber ?? 0),
	)
	return games.filter(
		(g) =>
			g.status !== "final" &&
			g.seriesGameNumber !== null &&
			g.seriesGameNumber > lastFinal,
	)
}

// The number of the game that won the series, once one has.
export function decidingGameNumber(
	games: SeriesGame[],
	bestOf: number | null,
): number | null {
	if (!bestOf) return null
	const ordered = games
		.filter((g) => g.seriesGameNumber !== null)
		.sort((a, b) => (a.seriesGameNumber ?? 0) - (b.seriesGameNumber ?? 0))
	for (const game of ordered) {
		const number = game.seriesGameNumber ?? 0
		if (seriesWinner(ordered, bestOf, number + 1)) return number
	}
	return null
}

export type SeriesStanding = {
	// Wins going into the game, from each side's point of view.
	homeWins: number
	awayWins: number
	// The teams that win the series with a win in this game. Both of them is a
	// winner-take-all game; one is an elimination game for the other side.
	clinchTeamIds: string[]
}

// Where a series stands going into one of its games.
export function standingBefore(
	game: SeriesGame,
	seriesGames: SeriesGame[],
	bestOf: number | null,
): SeriesStanding {
	const number = game.seriesGameNumber ?? 1
	const wins = seriesWins(seriesGames, number)
	const homeWins = wins.get(game.homeTeamId) ?? 0
	const awayWins = wins.get(game.awayTeamId) ?? 0
	const clinchTeamIds =
		bestOf && !seriesWinner(seriesGames, bestOf, number)
			? [game.homeTeamId, game.awayTeamId].filter(
					(teamId) => (wins.get(teamId) ?? 0) === winsNeeded(bestOf) - 1,
				)
			: []
	return { homeWins, awayWins, clinchTeamIds }
}

// One line on where a series stands, from the point of view of a game in it:
// going into the game while it's still to be played or in progress, and after
// it once it's final. "NYY leads 2-1", "Series tied 1-1", "SEA wins series
// 3-2", "Best of 5" before a first game.
export function seriesSummary(
	game: SeriesGame,
	seriesGames: SeriesGame[],
	bestOf: number | null,
	abbreviationOf: (teamId: string) => string,
): string | null {
	const number = game.seriesGameNumber ?? 1
	const after = game.status === "final"
	const wins = seriesWins(seriesGames, after ? number + 1 : number)
	const home = wins.get(game.homeTeamId) ?? 0
	const away = wins.get(game.awayTeamId) ?? 0
	if (home === 0 && away === 0) {
		return bestOf ? `Best of ${bestOf}` : null
	}
	if (home === away) return `Series tied ${home}-${away}`
	const leaderId = home > away ? game.homeTeamId : game.awayTeamId
	const score = `${Math.max(home, away)}-${Math.min(home, away)}`
	const decided = bestOf !== null && Math.max(home, away) >= winsNeeded(bestOf)
	return decided
		? `${abbreviationOf(leaderId)} wins series ${score}`
		: `${abbreviationOf(leaderId)} leads ${score}`
}

// The chance each team wins one of the series' games at home - see
// postseasonSeries.teamAHomeWinChance.
export type SeriesGameChances = {
	teamAId: string
	teamAHome: number
	teamBHome: number
}

// The chance team A wins game `number`, from which team that game lists as
// home. A game ESPN hasn't listed is read as neutral: the two home chances
// averaged from team A's side.
function teamAGameChance(
	games: SeriesGame[],
	number: number,
	chances: SeriesGameChances,
): number {
	const game = games.find((g) => g.seriesGameNumber === number)
	const atHome = chances.teamAHome
	const away = 1 - chances.teamBHome
	if (!game) return (atHome + away) / 2
	return game.homeTeamId === chances.teamAId ? atHome : away
}

export type SeriesOutlook = {
	// The chance team A wins the series from here.
	teamAWins: number
	// The chance the series is still undecided going into its last possible
	// game, which is when "does it go all N games?" is settled yes.
	goesDistance: number
}

// Where a series is headed from its final games so far, playing out every
// way its remaining games could go one game at a time, each at its own home
// side's chance.
export function seriesOutlook(
	games: SeriesGame[],
	bestOf: number,
	teamBId: string,
	chances: SeriesGameChances,
): SeriesOutlook {
	const need = winsNeeded(bestOf)
	const wins = seriesWins(games)
	const memo = new Map<string, SeriesOutlook>()
	const from = (a: number, b: number): SeriesOutlook => {
		if (a >= need) return { teamAWins: 1, goesDistance: 0 }
		if (b >= need) return { teamAWins: 0, goesDistance: 0 }
		if (a === need - 1 && b === need - 1) {
			const p = teamAGameChance(games, bestOf, chances)
			return { teamAWins: p, goesDistance: 1 }
		}
		const key = `${a}:${b}`
		const known = memo.get(key)
		if (known) return known
		const p = teamAGameChance(games, a + b + 1, chances)
		const ifA = from(a + 1, b)
		const ifB = from(a, b + 1)
		const outlook = {
			teamAWins: p * ifA.teamAWins + (1 - p) * ifB.teamAWins,
			goesDistance: p * ifA.goesDistance + (1 - p) * ifB.goesDistance,
		}
		memo.set(key, outlook)
		return outlook
	}
	return from(wins.get(chances.teamAId) ?? 0, wins.get(teamBId) ?? 0)
}

// How far into a series a call made now would be: its games already final,
// and the number of the one coming up.
export function seriesStage(games: SeriesGame[]): {
	gamesPlayed: number
	nextGameNumber: number
} {
	const gamesPlayed = games.filter((g) => g.status === "final").length
	return { gamesPlayed, nextGameNumber: gamesPlayed + 1 }
}

// The last game before which each series question still takes calls. Who
// wins stays open until the last possible game starts. Whether the series
// goes the distance is settled the moment that game is needed at all, so it
// stops a game earlier.
export function lastAskableGame(
	template: "winner" | "distance",
	bestOf: number,
): number {
	return template === "winner" ? bestOf : bestOf - 1
}
