import { eq } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../../db"
import { playerGameStats, players, teamGameStats } from "../../db/schema"

export type WatchCell = { text: string; num: number | null }

// One linked player's game. Athletes ESPN listed that the roster sync hasn't
// matched to a player have no name to show, so they're left out.
export type WatchPlayer = {
	playerId: string
	name: string
	starter: boolean | null
	didNotPlay: boolean
	stats: Map<string, WatchCell>
}

export type WatchSide = {
	teamId: string
	players: WatchPlayer[]
	teamBox: Map<string, WatchCell>
	tableTotals: Map<string, WatchCell>
	score: number | null
	// In order, "1".."n", then "SO" for a shootout.
	periods: { key: string; score: number }[]
}

// "21:34" -> 1294. Stored as text only, since a clock isn't a number to the
// box score's parser.
function clockSeconds(text: string): number | null {
	const match = /^(\d+):(\d{2})$/.exec(text.trim())
	return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

const cell = (text: string, num: number | null): WatchCell => ({
	text,
	num: num ?? clockSeconds(text),
})

const emptySide = (teamId: string): WatchSide => ({
	teamId,
	players: [],
	teamBox: new Map(),
	tableTotals: new Map(),
	score: null,
	periods: [],
})

const periodOrder = (key: string) => (key === "SO" ? 1000 : Number(key))

// A stored box score, by team.
export async function loadWatchBox(
	gameId: string,
): Promise<Map<string, WatchSide>> {
	const [playerRows, teamRows] = await Promise.all([
		db
			.select({
				playerId: playerGameStats.playerId,
				name: players.name,
				teamId: playerGameStats.teamId,
				starter: playerGameStats.starter,
				didNotPlay: playerGameStats.didNotPlay,
				statKey: playerGameStats.statKey,
				valueText: playerGameStats.valueText,
				valueNumeric: playerGameStats.valueNumeric,
			})
			.from(playerGameStats)
			.innerJoin(players, eq(players.id, playerGameStats.playerId))
			.where(eq(playerGameStats.gameId, gameId)),
		db.select().from(teamGameStats).where(eq(teamGameStats.gameId, gameId)),
	])

	const sides = new Map<string, WatchSide>()
	const sideOf = (teamId: string) => {
		const side = sides.get(teamId) ?? emptySide(teamId)
		sides.set(teamId, side)
		return side
	}

	const byPlayer = new Map<string, WatchPlayer>()
	for (const row of playerRows) {
		if (!row.playerId) continue
		const player = byPlayer.get(row.playerId) ?? {
			playerId: row.playerId,
			name: row.name,
			starter: row.starter,
			didNotPlay: row.didNotPlay,
			stats: new Map(),
		}
		if (!byPlayer.has(row.playerId)) {
			byPlayer.set(row.playerId, player)
			sideOf(row.teamId).players.push(player)
		}
		player.stats.set(row.statKey, cell(row.valueText, row.valueNumeric))
	}

	for (const row of teamRows) {
		const side = sideOf(row.teamId)
		const value = cell(row.valueText, row.valueNumeric)
		match(row.scope)
			.with("team_box", () => side.teamBox.set(row.statKey, value))
			.with("player_table_total", () =>
				side.tableTotals.set(row.statKey, value),
			)
			.with("final_score", () => {
				side.score = value.num
			})
			.with("period", () => {
				if (value.num !== null)
					side.periods.push({ key: row.statKey, score: value.num })
			})
			.exhaustive()
	}
	for (const side of sides.values()) {
		side.periods.sort((a, b) => periodOrder(a.key) - periodOrder(b.key))
	}
	return sides
}

export const statOf = (player: WatchPlayer, key: string) =>
	player.stats.get(key)?.num ?? null

export const played = (side: WatchSide) =>
	side.players.filter((p) => !p.didNotPlay)
