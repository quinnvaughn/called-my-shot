// The og:image behind /games/:id/picks/:username. It states how much of the
// game's official slate someone has called and, once questions settle, their
// record and points. None of the picks: those are on the page the link opens.
//
// Built on the shared og:image frame (see frame.ts), with the same cells as
// ballot-card.ts.
import { and, asc, eq, gt } from "drizzle-orm"
import { db } from "../../db"
import { questions } from "../../db/schema"
import { COLOR } from "../brand-palette"
import { loadGameEntry } from "../game-entry"
import { el, type SatoriNode } from "../share-image"
import { formatCallDate } from "./call-summary"
import { cardFrame, clamp, eyebrow, PERSON_MAX, statCell } from "./frame"

export type GameShareCardData = {
	leagueAbbr: string
	awayAbbr: string
	homeAbbr: string
	name: string
	username: string
	calledCount: number
	questionCount: number
	wins: number
	losses: number
	points: number
	// "Locks Sep 14, 2026" / "Awaiting results" - shown in place of the record
	// and points while nothing has settled.
	pendingLabel: string
}

export function buildGameShareCard(data: GameShareCardData): SatoriNode {
	const hasSettled = data.wins + data.losses > 0

	const cells: SatoriNode[] = [
		statCell("Called", `${data.calledCount} of ${data.questionCount}`),
	]
	if (hasSettled) {
		const up = data.points >= 0
		cells.push(statCell("Record", `${data.wins}–${data.losses}`))
		cells.push(
			statCell("Points", `${up ? "+" : "−"}${Math.abs(data.points)}`, {
				color: up ? COLOR.success : COLOR.danger,
				big: true,
			}),
		)
	} else {
		cells.push(statCell("Status", data.pendingLabel, { color: COLOR.dim }))
	}

	return cardFrame({
		eyebrow: `${data.leagueAbbr} · Game`,
		hero: el(
			"div",
			{
				display: "flex",
				flexDirection: "column",
				flex: "1",
				overflow: "hidden",
				alignItems: "center",
				justifyContent: "center",
				gap: "10px",
				paddingLeft: "48px",
				paddingRight: "48px",
			},
			[
				eyebrow(
					`${clamp(data.name, PERSON_MAX)}'s picks`,
					COLOR.primaryDefault,
				),
				el(
					"span",
					{
						display: "flex",
						fontFamily: "Archivo Black",
						fontSize: "68px",
						lineHeight: 1.1,
						textAlign: "center",
						color: COLOR.ink,
					},
					`${data.awayAbbr} @ ${data.homeAbbr}`,
				),
			],
		),
		cells,
		username: data.username,
	})
}

// Null for an unknown game, an unknown user, or a user with no official calls
// on it.
export async function loadGameShareCardData(
	gameId: string,
	username: string,
): Promise<GameShareCardData | null> {
	const [game, user] = await Promise.all([
		db.query.games.findFirst({
			where: { id: gameId },
			with: {
				league: { columns: { abbreviation: true } },
				awayTeam: { columns: { abbreviation: true } },
				homeTeam: { columns: { abbreviation: true } },
			},
		}),
		db.query.users.findFirst({ where: { username } }),
	])
	const entry = game && user ? await loadGameEntry(game.id, user.id) : null
	if (!game?.league || !game.awayTeam || !game.homeTeam || !user || !entry) {
		return null
	}

	const [nextLock] = await db
		.select({ locksAt: questions.locksAt })
		.from(questions)
		.where(
			and(
				eq(questions.gameId, game.id),
				eq(questions.isOfficial, true),
				gt(questions.locksAt, new Date()),
			),
		)
		.orderBy(asc(questions.locksAt))
		.limit(1)

	return {
		leagueAbbr: game.league.abbreviation.toUpperCase(),
		awayAbbr: game.awayTeam.abbreviation,
		homeAbbr: game.homeTeam.abbreviation,
		name: user.name,
		username: user.username,
		calledCount: entry.calledCount,
		questionCount: entry.members.length,
		wins: entry.wins,
		losses: entry.losses,
		points: entry.points,
		pendingLabel: nextLock
			? `Locks ${formatCallDate(nextLock.locksAt)}`
			: "Awaiting results",
	}
}
