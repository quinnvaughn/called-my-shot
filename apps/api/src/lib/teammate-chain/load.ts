import { and, eq, gte, inArray, isNotNull, lte, max, min } from "drizzle-orm"
import { db } from "../../db"
import {
	type League,
	type Player,
	playerFranchiseStints,
	players,
	type TeammateChainPuzzle,
	type TeammateChainResult,
	teammateChainPuzzles,
	teammateChainResults,
	teams,
} from "../../db/schema"
import {
	isSeasonLeague,
	type SeasonLeague,
} from "../season-puzzles/archive-parse"
import { loadChainHelp } from "./checks"
import { loadMysteryFacts, mysteryClues } from "./clues"
import { isDeadEnd } from "./help"
import {
	type ChainState,
	chainResultCode,
	chainSeconds,
	evaluateChainMoves,
} from "./play"
import { type ChainRarity, loadChainRarity } from "./rarity"
import {
	type ChainLinkDetail,
	type ChainPlayerTeam,
	loadChainLinkDetails,
	loadPlayerTeams,
} from "./teammates"

// A scheduled puzzle with its league.
export type LoadedChainPuzzle = TeammateChainPuzzle & { league: League }

export async function findChainPuzzleForDay(
	day: string,
): Promise<LoadedChainPuzzle | null> {
	return (
		(await db.query.teammateChainPuzzles.findFirst({
			where: { playDate: day },
			with: { league: true },
		})) ?? null
	)
}

export async function findChainPuzzle(
	id: string,
): Promise<LoadedChainPuzzle | null> {
	return (
		(await db.query.teammateChainPuzzles.findFirst({
			where: { id },
			with: { league: true },
		})) ?? null
	)
}

export function chainLeague(puzzle: LoadedChainPuzzle): SeasonLeague {
	const slug = puzzle.league.slug
	if (!isSeasonLeague(slug)) {
		throw new Error(`Teammate Chain puzzle in unsupported league ${slug}`)
	}
	return slug
}

// A player as the game shows him: name, photo, the first and last seasons
// he played in the league ("1985-2003"), and every team he played for
// there. `teams` is null when it wasn't loaded with him (a search result),
// for the GraphQL field to load on its own.
export type ChainPlayer = {
	player: Player
	leagueId: string
	firstSeason: number | null
	lastSeason: number | null
	teams: ChainPlayerTeam[] | null
}

export async function loadChainPlayers(
	leagueId: string,
	playerIds: readonly string[],
): Promise<Map<string, ChainPlayer>> {
	const ids = [...new Set(playerIds)]
	if (ids.length === 0) return new Map()
	const [playerRows, years, teamsOf] = await Promise.all([
		db.select().from(players).where(inArray(players.id, ids)),
		db
			.select({
				playerId: playerFranchiseStints.playerId,
				firstSeason: min(playerFranchiseStints.firstSeason),
				lastSeason: max(playerFranchiseStints.lastSeason),
			})
			.from(playerFranchiseStints)
			.innerJoin(teams, eq(teams.id, playerFranchiseStints.teamId))
			.where(
				and(
					eq(teams.leagueId, leagueId),
					inArray(playerFranchiseStints.playerId, ids),
				),
			)
			.groupBy(playerFranchiseStints.playerId),
		loadPlayerTeams(leagueId, ids),
	])
	const yearsOf = new Map(years.map((row) => [row.playerId, row]))
	return new Map(
		playerRows.map((player) => [
			player.id,
			{
				player,
				leagueId,
				firstSeason: yearsOf.get(player.id)?.firstSeason ?? null,
				lastSeason: yearsOf.get(player.id)?.lastSeason ?? null,
				teams: teamsOf.get(player.id) ?? [],
			},
		]),
	)
}

// One player in a chain, with what he shared with the player before him.
export type ChainStep = { player: ChainPlayer; shared: ChainLinkDetail[] }

// A game with everything it mentions loaded, so the GraphQL layer can hand
// back whole players and links without a lookup each.
export type ChainPlayView = {
	puzzle: LoadedChainPuzzle
	state: ChainState
	startedAt: Date | null
	finishedAt: Date | null
	seconds: number | null
	playersById: Map<string, ChainPlayer>
	// The middle players, each with his link to the one before.
	chain: ChainStep[]
	// The last player's link to the target, once it's solved.
	connection: ChainLinkDetail[]
	// The par route, once the game is over.
	parRoute: ChainStep[] | null
	parConnection: ChainLinkDetail[]
	// Null until it's solved.
	rarity: ChainRarity | null
	// No route from the chain's last player reaches the target in the links
	// left. Only ever true while the game is going.
	deadEnd: boolean
	// The clues showing about the current mystery teammate, vaguest first.
	clues: string[]
}

export type ChainRoute = { steps: ChainStep[]; connection: ChainLinkDetail[] }

async function stepsFor(
	puzzle: LoadedChainPuzzle,
	middle: readonly string[],
	playersById: Map<string, ChainPlayer>,
): Promise<ChainRoute> {
	const details = await loadChainLinkDetails(chainLeague(puzzle), [
		puzzle.startPlayerId,
		...middle,
		puzzle.targetPlayerId,
	])
	return {
		steps: middle.flatMap((playerId, i) => {
			const player = playersById.get(playerId)
			return player ? [{ player, shared: details[i] ?? [] }] : []
		}),
		connection: details[middle.length] ?? [],
	}
}

// A route's middle players with every link along it.
export async function loadChainRoute(
	puzzle: LoadedChainPuzzle,
	middle: readonly string[],
): Promise<ChainRoute> {
	return stepsFor(
		puzzle,
		middle,
		await loadChainPlayers(puzzle.leagueId, middle),
	)
}

export async function loadChainPlayView(
	puzzle: LoadedChainPuzzle,
	result: Pick<
		TeammateChainResult,
		"moves" | "startedAt" | "finishedAt"
	> | null,
	{ saved = true }: { saved?: boolean } = {},
): Promise<ChainPlayView> {
	const state = evaluateChainMoves(result?.moves ?? [])
	const mentioned = [
		puzzle.startPlayerId,
		puzzle.targetPlayerId,
		...state.moves.flatMap((move) =>
			move.kind === "add" || move.kind === "miss" ? [move.playerId] : [],
		),
		...(state.over ? puzzle.parRoute : []),
	]
	const playersById = await loadChainPlayers(puzzle.leagueId, mentioned)
	const end = state.chain.at(-1) ?? puzzle.startPlayerId
	const [mine, par, rarity, help, facts] = await Promise.all([
		stepsFor(puzzle, state.chain, playersById),
		state.over ? stepsFor(puzzle, puzzle.parRoute, playersById) : null,
		state.status === "solved"
			? loadChainRarity(puzzle.id, state.chain, { unsaved: !saved })
			: null,
		state.over ? null : loadChainHelp(puzzle),
		state.mystery && !state.over
			? loadMysteryFacts(puzzle.leagueId, end, state.mystery.playerId)
			: null,
	])
	const startedAt = result?.startedAt ?? null
	const finishedAt = result?.finishedAt ?? null
	return {
		puzzle,
		state,
		startedAt,
		finishedAt,
		seconds: startedAt ? chainSeconds(startedAt, finishedAt) : null,
		playersById,
		chain: mine.steps,
		connection: state.status === "solved" ? mine.connection : [],
		parRoute: par?.steps ?? null,
		parConnection: par?.connection ?? [],
		rarity,
		deadEnd: help ? isDeadEnd(puzzle, state, help.toTarget) : false,
		clues:
			facts && state.mystery
				? mysteryClues(
						chainLeague(puzzle),
						puzzle.league.abbreviation,
						facts,
					).slice(0, state.mystery.clues)
				: [],
	}
}

// One finished game, for a player's stats.
export type FinishedChainGame = {
	day: string
	par: number
	links: number | null
	seconds: number | null
}

export async function loadFinishedChainGames(
	userId: string,
): Promise<FinishedChainGame[]> {
	const rows = await db
		.select({
			day: teammateChainPuzzles.playDate,
			par: teammateChainPuzzles.par,
			moves: teammateChainResults.moves,
			startedAt: teammateChainResults.startedAt,
			finishedAt: teammateChainResults.finishedAt,
		})
		.from(teammateChainResults)
		.innerJoin(
			teammateChainPuzzles,
			eq(teammateChainPuzzles.id, teammateChainResults.puzzleId),
		)
		.where(
			and(
				eq(teammateChainResults.userId, userId),
				isNotNull(teammateChainResults.finishedAt),
			),
		)
	return rows.map((row) => {
		const state = evaluateChainMoves(row.moves)
		return {
			day: row.day,
			par: row.par,
			links: state.links,
			seconds:
				state.status === "solved"
					? chainSeconds(row.startedAt, row.finishedAt)
					: null,
		}
	})
}

// The puzzles that ran between two days, inclusive, with every result on
// them from `userIds`.
export async function loadChainResultsBetween(
	fromDay: string,
	toDay: string,
	userIds: string[],
) {
	if (userIds.length === 0) return []
	return db
		.select({
			day: teammateChainPuzzles.playDate,
			par: teammateChainPuzzles.par,
			userId: teammateChainResults.userId,
			moves: teammateChainResults.moves,
			startedAt: teammateChainResults.startedAt,
			finishedAt: teammateChainResults.finishedAt,
		})
		.from(teammateChainResults)
		.innerJoin(
			teammateChainPuzzles,
			eq(teammateChainPuzzles.id, teammateChainResults.puzzleId),
		)
		.where(
			and(
				gte(teammateChainPuzzles.playDate, fromDay),
				lte(teammateChainPuzzles.playDate, toDay),
				inArray(teammateChainResults.userId, userIds),
			),
		)
}

// The player a shared link names (its ?by=), only when their own finished
// game on the puzzle has the link's result. A link can put any name and any
// result in its url, so anything else is nobody's.
export async function verifiedChainSharer(
	puzzle: LoadedChainPuzzle,
	username: string,
	code: string,
) {
	const user = await db.query.users.findFirst({ where: { username } })
	if (!user) return null
	const result = await db.query.teammateChainResults.findFirst({
		where: { puzzleId: puzzle.id, userId: user.id },
	})
	if (!result?.finishedAt) return null
	const state = evaluateChainMoves(result.moves)
	const own = chainResultCode(
		state,
		chainSeconds(result.startedAt, result.finishedAt),
	)
	return own === code.toLowerCase() ? user : null
}

// A player's solved route on a puzzle, for the one a shared link shows once
// the day is over. Null when they didn't solve it.
export async function loadSharerRoute(
	puzzle: LoadedChainPuzzle,
	userId: string,
): Promise<string[] | null> {
	const result = await db.query.teammateChainResults.findFirst({
		where: { puzzleId: puzzle.id, userId },
	})
	return result?.solved ? result.route : null
}
