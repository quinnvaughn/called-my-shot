import { nextArcadeDayAt } from "../../../lib/arcade/day"
import {
	type ChainPlayer,
	type ChainPlayView,
	type ChainRoute,
	type ChainStep,
	type LoadedChainPuzzle,
	loadChainPlayers,
	loadChainRoute,
	loadSharerRoute,
	verifiedChainSharer,
} from "../../../lib/teammate-chain/load"
import {
	CHAIN_CLUE_COUNT,
	chainResultCode,
} from "../../../lib/teammate-chain/play"
import type { ChainRarity } from "../../../lib/teammate-chain/rarity"
import type { ChainStats } from "../../../lib/teammate-chain/stats"
import {
	type ChainLinkDetail,
	type ChainPlayerTeam,
	loadPlayerTeams,
} from "../../../lib/teammate-chain/teammates"
import { builder } from "../../builder"
import { LeagueRef, PlayerRef, TeamRef } from "../sports"
import { UserRef } from "../user"

export const ChainStatusEnum = builder.enumType("TeammateChainStatus", {
	values: {
		PLAYING: { value: "playing" },
		SOLVED: { value: "solved" },
		GAVE_UP: { value: "gave_up" },
	} as const,
})

export const ChainInputKindEnum = builder.enumType("TeammateChainInputKind", {
	values: {
		PICK: { value: "pick" },
		HINT: { value: "hint" },
		UNDO: { value: "undo" },
		GIVE_UP: { value: "give_up" },
	} as const,
})

export const ChainMoveKindEnum = builder.enumType("TeammateChainMoveKind", {
	values: {
		ADD: { value: "add" },
		MISS: { value: "miss" },
		HINT: { value: "hint" },
		UNDO: { value: "undo" },
		GIVE_UP: { value: "give_up" },
	} as const,
})

// One thing a guest did, in order, for guest play and the import after
// signing up. A pick names a player; undo and give up don't.
export const ChainInputRef = builder.inputType("TeammateChainInput", {
	fields: (t) => ({
		kind: t.field({ type: ChainInputKindEnum, required: true }),
		playerId: t.id({ required: false }),
	}),
})

// One team a player played for, under its name then: "Seattle
// SuperSonics", "1997-2003".
const ChainPlayerTeamRef = builder
	.objectRef<ChainPlayerTeam>("TeammateChainPlayerTeam")
	.implement({
		fields: (t) => ({
			team: t.field({ type: TeamRef, resolve: (e) => e.team }),
			name: t.exposeString("name"),
			years: t.exposeString("years"),
		}),
	})

// A player as the game shows him, with the first and last seasons he played
// in the league and every team he played for there.
export const ChainPlayerRef = builder
	.objectRef<ChainPlayer>("TeammateChainPlayer")
	.implement({
		fields: (t) => ({
			player: t.field({ type: PlayerRef, resolve: (p) => p.player }),
			firstSeason: t.int({ nullable: true, resolve: (p) => p.firstSeason }),
			lastSeason: t.int({ nullable: true, resolve: (p) => p.lastSeason }),
			// In the order he got there.
			teams: t.field({
				type: [ChainPlayerTeamRef],
				resolve: async (p) =>
					p.teams ??
					(await loadPlayerTeams(p.leagueId, [p.player.id])).get(p.player.id) ??
					[],
			}),
		}),
	})

// What two neighbors in a chain shared: "Chicago Bulls, 1995-96 to 1997-98".
export const ChainLinkRef = builder
	.objectRef<ChainLinkDetail>("TeammateChainLink")
	.implement({
		fields: (t) => ({
			team: t.field({ type: TeamRef, resolve: (l) => l.team }),
			// What the franchise was called then.
			name: t.exposeString("name"),
			label: t.exposeString("label"),
			// Teammates through today's roster rather than a past season.
			current: t.exposeBoolean("current"),
		}),
	})

// One player in a chain, with everything he shared with the player before
// him, most recent first.
export const ChainStepRef = builder
	.objectRef<ChainStep>("TeammateChainStep")
	.implement({
		fields: (t) => ({
			player: t.field({ type: ChainPlayerRef, resolve: (s) => s.player }),
			shared: t.field({ type: [ChainLinkRef], resolve: (s) => s.shared }),
		}),
	})

// A whole route: the middle players with their links, then the last one's
// link to the target.
export const ChainRouteRef = builder
	.objectRef<ChainRoute>("TeammateChainRoute")
	.implement({
		fields: (t) => ({
			steps: t.field({ type: [ChainStepRef], resolve: (r) => r.steps }),
			connection: t.field({
				type: [ChainLinkRef],
				resolve: (r) => r.connection,
			}),
		}),
	})

type MoveRow = {
	kind: "add" | "miss" | "hint" | "undo" | "give_up"
	player: ChainPlayer | null
}

const ChainMoveRef = builder.objectRef<MoveRow>("TeammateChainMove").implement({
	fields: (t) => ({
		kind: t.field({ type: ChainMoveKindEnum, resolve: (m) => m.kind }),
		player: t.field({
			type: ChainPlayerRef,
			nullable: true,
			resolve: (m) => m.player,
		}),
	}),
})

type RarityRow = { player: ChainPlayer; count: number; share: number }

const ChainRarityPlayerRef = builder
	.objectRef<RarityRow>("TeammateChainRarityPlayer")
	.implement({
		fields: (t) => ({
			player: t.field({ type: ChainPlayerRef, resolve: (r) => r.player }),
			// Solvers who went through him, this game included.
			count: t.exposeInt("count"),
			// That count over every solver, 0 to 1.
			share: t.exposeFloat("share"),
		}),
	})

const ChainRarityRef = builder
	.objectRef<{ rarity: ChainRarity; playersById: Map<string, ChainPlayer> }>(
		"TeammateChainRarity",
	)
	.implement({
		fields: (t) => ({
			// Everyone who's solved the day's chain so far, this game included.
			solvers: t.int({ resolve: (r) => r.rarity.solvers }),
			// How many of them took exactly this route, this game included.
			sameRoute: t.int({ resolve: (r) => r.rarity.sameRoute }),
			// The route's players in order.
			players: t.field({
				type: [ChainRarityPlayerRef],
				resolve: (r) =>
					r.rarity.players.flatMap((p) => {
						const player = r.playersById.get(p.playerId)
						return player ? [{ ...p, player }] : []
					}),
			}),
		}),
	})

// One player's game on one puzzle.
export const ChainPlayRef = builder
	.objectRef<ChainPlayView>("TeammateChainPlay")
	.implement({
		fields: (t) => ({
			status: t.field({
				type: ChainStatusEnum,
				resolve: (v) => v.state.status,
			}),
			// When they pressed Start. Null before.
			startedAt: t.field({
				type: "DateTime",
				nullable: true,
				resolve: (v) => v.startedAt,
			}),
			// Start to finish. Null while it's going.
			seconds: t.int({ nullable: true, resolve: (v) => v.seconds }),
			// The middle players so far, each with his link to the one before.
			chain: t.field({ type: [ChainStepRef], resolve: (v) => v.chain }),
			// The last player's link to the target, once it's solved.
			connection: t.field({
				type: [ChainLinkRef],
				resolve: (v) => v.connection,
			}),
			// Everything they did, in order, for the result's squares.
			moves: t.field({
				type: [ChainMoveRef],
				resolve: (v) =>
					v.state.moves.map((move) => ({
						kind: move.kind,
						player:
							move.kind === "add" || move.kind === "miss"
								? (v.playersById.get(move.playerId) ?? null)
								: null,
					})),
			}),
			misses: t.int({ resolve: (v) => v.state.misses }),
			hints: t.int({ resolve: (v) => v.state.hints }),
			// The clues showing about the current mystery teammate of the
			// chain's last player, vaguest first. Empty until a hint, and again
			// once the chain changes.
			clues: t.stringList({ resolve: (v) => v.clues }),
			// Whether another hint about the current mystery is left. False
			// before the first hint too, when it's deadEnd that says whether
			// one can be had.
			cluesLeft: t.boolean({
				resolve: (v) =>
					!!v.state.mystery && v.state.mystery.clues < CHAIN_CLUE_COUNT,
			}),
			// No route from the chain's last player reaches the target in the
			// links left: take someone back.
			deadEnd: t.exposeBoolean("deadEnd"),
			// Middle players plus one. Null until it's solved.
			links: t.int({ nullable: true, resolve: (v) => v.state.links }),
			// What a share link carries: "3-1-0-94", or "x-2-1" for a game given up.
			resultCode: t.string({
				nullable: true,
				resolve: (v) => chainResultCode(v.state, v.seconds),
			}),
			// One route in par, once the game is over.
			parRoute: t.field({
				type: [ChainStepRef],
				nullable: true,
				resolve: (v) => v.parRoute,
			}),
			parConnection: t.field({
				type: [ChainLinkRef],
				resolve: (v) => v.parConnection,
			}),
			// How this route compares with everyone else's today, once solved.
			rarity: t.field({
				type: ChainRarityRef,
				nullable: true,
				resolve: (v) =>
					v.rarity ? { rarity: v.rarity, playersById: v.playersById } : null,
			}),
		}),
	})

async function chainPlayer(
	leagueId: string,
	playerId: string,
): Promise<ChainPlayer> {
	const found = (await loadChainPlayers(leagueId, [playerId])).get(playerId)
	if (!found) throw new Error(`player ${playerId} missing`)
	return found
}

// A scheduled puzzle as players see it: who to connect, and par. Both ends
// are public, since they're the dare.
export const ChainPuzzleRef = builder
	.objectRef<LoadedChainPuzzle>("TeammateChainPuzzle")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			date: t.exposeString("playDate"),
			league: t.field({ type: LeagueRef, resolve: (p) => p.league }),
			start: t.field({
				type: ChainPlayerRef,
				resolve: (p) => chainPlayer(p.leagueId, p.startPlayerId),
			}),
			target: t.field({
				type: ChainPlayerRef,
				resolve: (p) => chainPlayer(p.leagueId, p.targetPlayerId),
			}),
			// The fewest links any route needs.
			par: t.exposeInt("par"),
			nextPuzzleAt: t.field({
				type: "DateTime",
				resolve: () => nextArcadeDayAt(new Date()),
			}),
		}),
	})

export type ChainShare = {
	puzzle: LoadedChainPuzzle
	revealed: boolean
}

// A puzzle as a share link shows it: the ends and par always, a route only
// once its day is over.
export const ChainShareRef = builder
	.objectRef<ChainShare>("TeammateChainShare")
	.implement({
		fields: (t) => ({
			puzzle: t.field({ type: ChainPuzzleRef, resolve: (s) => s.puzzle }),
			revealed: t.exposeBoolean("revealed"),
			// Who a shared link says played it (its ?by=), only when the
			// link's result is that player's real one.
			sharer: t.field({
				type: UserRef,
				nullable: true,
				args: {
					username: t.arg.string({ required: true }),
					result: t.arg.string({ required: true }),
				},
				resolve: (s, args) =>
					verifiedChainSharer(s.puzzle, args.username, args.result),
			}),
			// The verified sharer's solved route, once the day is over.
			sharerRoute: t.field({
				type: ChainRouteRef,
				nullable: true,
				args: {
					username: t.arg.string({ required: true }),
					result: t.arg.string({ required: true }),
				},
				resolve: async (s, args) => {
					if (!s.revealed) return null
					const user = await verifiedChainSharer(
						s.puzzle,
						args.username,
						args.result,
					)
					if (!user) return null
					const route = await loadSharerRoute(s.puzzle, user.id)
					return route ? loadChainRoute(s.puzzle, route) : null
				},
			}),
			// One route in par, once the day is over.
			parRoute: t.field({
				type: ChainRouteRef,
				nullable: true,
				resolve: (s) =>
					s.revealed ? loadChainRoute(s.puzzle, s.puzzle.parRoute) : null,
			}),
		}),
	})

export const ChainStatsRef = builder
	.objectRef<ChainStats>("TeammateChainStats")
	.implement({
		fields: (t) => ({
			played: t.exposeInt("played"),
			solved: t.exposeInt("solved"),
			atPar: t.exposeInt("atPar"),
			averageOverPar: t.float({
				nullable: true,
				resolve: (s) => s.averageOverPar,
			}),
			bestSeconds: t.int({ nullable: true, resolve: (s) => s.bestSeconds }),
			currentStreak: t.exposeInt("currentStreak"),
			bestStreak: t.exposeInt("bestStreak"),
		}),
	})
