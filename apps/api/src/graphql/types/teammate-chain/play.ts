import { and, eq, sql } from "drizzle-orm"
import { db } from "../../../db"
import { teammateChainResults } from "../../../db/schema"
import { arcadeDay, isArcadeDay } from "../../../lib/arcade/day"
import { requireUser } from "../../../lib/auth"
import {
	AuthenticationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { rushmorePool } from "../../../lib/prompts/pool"
import { loadChainChecks } from "../../../lib/teammate-chain/checks"
import {
	type ChainPlayer,
	findChainPuzzle,
	findChainPuzzleForDay,
	type LoadedChainPuzzle,
	loadChainPlayView,
	loadFinishedChainGames,
} from "../../../lib/teammate-chain/load"
import {
	type ChainInput,
	type ChainRefusal,
	chainInputPlayers,
	evaluateChainMoves,
	judgeChainInput,
	judgeChainInputs,
	refuseChainInput,
} from "../../../lib/teammate-chain/play"
import { fillChainSchedule } from "../../../lib/teammate-chain/schedule"
import { chainStats } from "../../../lib/teammate-chain/stats"
import { loadPlayerTeams } from "../../../lib/teammate-chain/teammates"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import {
	ChainInputRef,
	ChainPlayerRef,
	ChainPlayRef,
	ChainPuzzleRef,
	ChainShareRef,
	ChainStatsRef,
} from "./refs"

// Today's puzzle by id, the only one that can be played. `anyDay` lifts that
// for an admin's unsaved practice game.
async function playableChainPuzzle(
	puzzleId: string,
	{ anyDay = false } = {},
): Promise<LoadedChainPuzzle> {
	const puzzle = isUuid(puzzleId) ? await findChainPuzzle(puzzleId) : null
	if (!puzzle || (!anyDay && puzzle.playDate !== arcadeDay(new Date()))) {
		throw new NotFoundError("That puzzle isn't today's")
	}
	return puzzle
}

const REFUSAL_MESSAGES: Record<ChainRefusal, string> = {
	finished: "Today's chain is already over.",
	repeat: "That player is already in your chain.",
	unknown_player: "Pick a player from the list.",
	chain_full: "Your chain is full. Undo a player or give up.",
	nothing_to_undo: "There's nobody to take back.",
	dead_end:
		"Nobody who played with your last player can still reach the target. Take someone back first.",
	out_of_clues: "That's every clue about this player.",
}

const toInputs = (
	raw: readonly {
		kind: ChainInput["kind"]
		playerId?: string | number | null
	}[],
): ChainInput[] =>
	raw.flatMap((input): ChainInput[] => {
		if (input.kind !== "pick") return [{ kind: input.kind }]
		const playerId = input.playerId ? String(input.playerId) : ""
		return isUuid(playerId) ? [{ kind: "pick", playerId }] : []
	})

// Judges a guest's inputs against the rosters, dropping any that couldn't
// have been made.
async function judgeGuestInputs(
	puzzle: LoadedChainPuzzle,
	inputs: ChainInput[],
) {
	const checks = await loadChainChecks(
		puzzle,
		chainInputPlayers(puzzle, inputs),
	)
	return judgeChainInputs(puzzle, inputs, checks)
}

// A guest's own times, kept in range: no earlier than the day began, no
// later than now, and finished no earlier than started.
function guestTimes(
	startedAt: Date,
	finishedAt: Date | null | undefined,
	over: boolean,
) {
	const now = new Date()
	const start = new Date(Math.min(startedAt.getTime(), now.getTime()))
	if (!over) return { startedAt: start, finishedAt: null }
	const end = finishedAt ?? now
	return {
		startedAt: start,
		finishedAt: new Date(
			Math.min(Math.max(end.getTime(), start.getTime()), now.getTime()),
		),
	}
}

builder.objectField(ChainPuzzleRef, "viewerPlay", (t) =>
	t.field({
		type: ChainPlayRef,
		nullable: true,
		description:
			"The signed-in viewer's game on this puzzle. Null before they press Start.",
		resolve: async (puzzle, _args, ctx) => {
			if (!ctx.user) return null
			const result = await db.query.teammateChainResults.findFirst({
				where: { puzzleId: puzzle.id, userId: ctx.user.id },
			})
			return result ? loadChainPlayView(puzzle, result) : null
		},
	}),
)

builder.queryFields((t) => ({
	// Null only when nothing is scheduled and nothing is left to schedule. A
	// day the daily fill hasn't reached yet is filled here, on the first
	// visit.
	teammateChainToday: t.field({
		type: ChainPuzzleRef,
		nullable: true,
		resolve: async () => {
			const today = arcadeDay(new Date())
			const found = await findChainPuzzleForDay(today)
			if (found) return found
			try {
				await fillChainSchedule()
			} catch {
				// Two first visits filling at once: the unique day index turns
				// one away, and the other's fill is the one read below.
			}
			return findChainPuzzleForDay(today)
		},
	}),

	// Everyone who played in the puzzle's league whose name matches, best
	// known first. Says nothing about who fits the chain.
	teammateChainPlayers: t.field({
		type: [ChainPlayerRef],
		args: {
			puzzleId: t.arg.id({ required: true }),
			search: t.arg.string({ required: true }),
			first: t.arg.int(),
		},
		resolve: async (_root, args): Promise<ChainPlayer[]> => {
			const puzzleId = String(args.puzzleId)
			const search = args.search.trim()
			if (!isUuid(puzzleId) || search.length < 2) return []
			const puzzle = await findChainPuzzle(puzzleId)
			if (!puzzle) return []
			const pool = await rushmorePool(
				{
					leagueId: puzzle.leagueId,
					teamId: null,
					positions: [],
					fromYear: null,
					toYear: null,
				},
				{ search, first: args.first ?? 8 },
			)
			const teamsOf = await loadPlayerTeams(
				puzzle.leagueId,
				pool.map((entry) => entry.player.id),
			)
			return pool.map((entry) => ({
				player: entry.player,
				leagueId: puzzle.leagueId,
				firstSeason: entry.firstSeason,
				lastSeason: entry.lastSeason,
				teams: teamsOf.get(entry.player.id) ?? [],
			}))
		},
	}),

	// A signed-out player's game, held in their browser. Stateless: the
	// inputs passed in are judged and nothing is stored. Admins can play any
	// day's this way, as practice.
	teammateChainGuestPlay: t.field({
		type: ChainPlayRef,
		errors: {
			types: [NotFoundError],
			directResult: true,
			union: { name: "TeammateChainGuestPlayResult" },
		},
		args: {
			puzzleId: t.arg.id({ required: true }),
			inputs: t.arg({ type: [ChainInputRef], required: true }),
			startedAt: t.arg({ type: "DateTime", required: true }),
			finishedAt: t.arg({ type: "DateTime", required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const puzzle = await playableChainPuzzle(String(args.puzzleId), {
				anyDay: ctx.user?.isAdmin === true,
			})
			const moves = await judgeGuestInputs(puzzle, toInputs(args.inputs))
			const times = guestTimes(
				args.startedAt,
				args.finishedAt,
				evaluateChainMoves(moves).over,
			)
			return loadChainPlayView(puzzle, { moves, ...times }, { saved: false })
		},
	}),

	// What a shared result link shows. Null for a day with no puzzle, or one
	// that hasn't come yet.
	teammateChainShare: t.field({
		type: ChainShareRef,
		nullable: true,
		args: { date: t.arg.string({ required: true }) },
		resolve: async (_root, args) => {
			if (!isArcadeDay(args.date)) return null
			const today = arcadeDay(new Date())
			if (args.date > today) return null
			const puzzle = await findChainPuzzleForDay(args.date)
			if (!puzzle) return null
			return { puzzle, revealed: args.date < today }
		},
	}),

	// Null for a signed-out viewer, whose games aren't kept.
	viewerTeammateChainStats: t.field({
		type: ChainStatsRef,
		nullable: true,
		resolve: async (_root, _args, ctx) => {
			if (!ctx.user) return null
			return chainStats(
				await loadFinishedChainGames(ctx.user.id),
				arcadeDay(new Date()),
			)
		},
	}),
}))

const playErrors = (name: string) => ({
	types: [AuthenticationError, NotFoundError, ValidationError],
	directResult: true as const,
	union: { name },
})

// Applies one input to the viewer's game, starting it if they hadn't.
async function applyChainInput(
	userId: string,
	puzzle: LoadedChainPuzzle,
	input: ChainInput,
) {
	const ids = chainInputPlayers(puzzle, [input])
	return db.transaction(async (tx) => {
		await tx
			.insert(teammateChainResults)
			.values({ puzzleId: puzzle.id, userId })
			.onConflictDoNothing()
		const [row] = await tx
			.select()
			.from(teammateChainResults)
			.where(
				and(
					eq(teammateChainResults.puzzleId, puzzle.id),
					eq(teammateChainResults.userId, userId),
				),
			)
			.for("update")
		if (!row) throw new Error("applyChainInput: result row vanished")
		const state = evaluateChainMoves(row.moves)
		const last = state.chain.at(-1)
		const checks = await loadChainChecks(puzzle, last ? [...ids, last] : ids)
		const refusal = refuseChainInput(puzzle, state, input, checks)
		if (refusal) {
			throw ValidationError.field("playerId", REFUSAL_MESSAGES[refusal])
		}
		const moves = [...row.moves, judgeChainInput(puzzle, state, input, checks)]
		const next = evaluateChainMoves(moves)
		const [saved] = await tx
			.update(teammateChainResults)
			.set({
				moves,
				finishedAt: next.over ? new Date() : null,
				solved: next.status === "solved",
				route: next.status === "solved" ? next.chain : [],
			})
			.where(eq(teammateChainResults.id, row.id))
			.returning()
		return saved ?? row
	})
}

builder.mutationFields((t) => ({
	// Starts the clock on today's game. Pressing it again changes nothing.
	startTeammateChain: t.field({
		type: ChainPlayRef,
		errors: playErrors("StartTeammateChainResult"),
		args: { puzzleId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const puzzle = await playableChainPuzzle(String(args.puzzleId))
			await db
				.insert(teammateChainResults)
				.values({ puzzleId: puzzle.id, userId: user.id })
				.onConflictDoNothing()
			const result = await db.query.teammateChainResults.findFirst({
				where: { puzzleId: puzzle.id, userId: user.id },
			})
			return loadChainPlayView(puzzle, result ?? null)
		},
	}),

	addChainPlayer: t.field({
		type: ChainPlayRef,
		errors: playErrors("AddChainPlayerResult"),
		args: {
			puzzleId: t.arg.id({ required: true }),
			playerId: t.arg.id({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const puzzle = await playableChainPuzzle(String(args.puzzleId))
			const playerId = String(args.playerId)
			if (!isUuid(playerId)) {
				throw ValidationError.field("playerId", REFUSAL_MESSAGES.unknown_player)
			}
			const saved = await applyChainInput(user.id, puzzle, {
				kind: "pick",
				playerId,
			})
			return loadChainPlayView(puzzle, saved)
		},
	}),

	// One more clue about a mystery teammate of the chain's last player.
	hintTeammateChain: t.field({
		type: ChainPlayRef,
		errors: playErrors("HintTeammateChainResult"),
		args: { puzzleId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const puzzle = await playableChainPuzzle(String(args.puzzleId))
			const saved = await applyChainInput(user.id, puzzle, { kind: "hint" })
			return loadChainPlayView(puzzle, saved)
		},
	}),

	// Takes the newest player back off the chain.
	undoChainPlayer: t.field({
		type: ChainPlayRef,
		errors: playErrors("UndoChainPlayerResult"),
		args: { puzzleId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const puzzle = await playableChainPuzzle(String(args.puzzleId))
			const saved = await applyChainInput(user.id, puzzle, { kind: "undo" })
			return loadChainPlayView(puzzle, saved)
		},
	}),

	giveUpTeammateChain: t.field({
		type: ChainPlayRef,
		errors: playErrors("GiveUpTeammateChainResult"),
		args: { puzzleId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const puzzle = await playableChainPuzzle(String(args.puzzleId))
			const saved = await applyChainInput(user.id, puzzle, {
				kind: "give_up",
			})
			return loadChainPlayView(puzzle, saved)
		},
	}),

	// Saves the game a player finished, or got partway through, before they
	// had an account, with its times. Only today's, and only if the account
	// has no game on it yet: an account that already played keeps its own.
	importTeammateChainMoves: t.field({
		type: ChainPlayRef,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "ImportTeammateChainMovesResult" },
		},
		args: {
			puzzleId: t.arg.id({ required: true }),
			inputs: t.arg({ type: [ChainInputRef], required: true }),
			startedAt: t.arg({ type: "DateTime", required: true }),
			finishedAt: t.arg({ type: "DateTime", required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const puzzle = await playableChainPuzzle(String(args.puzzleId))
			const moves = await judgeGuestInputs(puzzle, toInputs(args.inputs))
			const state = evaluateChainMoves(moves)
			const values = {
				moves,
				...guestTimes(args.startedAt, args.finishedAt, state.over),
				solved: state.status === "solved",
				route: state.status === "solved" ? state.chain : [],
			}
			await db
				.insert(teammateChainResults)
				.values({ puzzleId: puzzle.id, userId: user.id, ...values })
				.onConflictDoUpdate({
					target: [teammateChainResults.puzzleId, teammateChainResults.userId],
					set: values,
					setWhere: sql`jsonb_array_length(${teammateChainResults.moves}) = 0`,
				})
			const saved = await db.query.teammateChainResults.findFirst({
				where: { puzzleId: puzzle.id, userId: user.id },
			})
			return loadChainPlayView(puzzle, saved ?? null)
		},
	}),
}))
