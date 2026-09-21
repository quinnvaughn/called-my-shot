// The og:image behind /ballots/:slug/:username. It states how much of the
// ballot someone has called and, once members settle, their record and
// points. None of the picks: those are on the page the link opens.
//
// Built on the shared og:image frame (see frame.ts).
import { and, asc, eq, gt } from "drizzle-orm"
import { db } from "../../db"
import { ballotQuestions, questions } from "../../db/schema"
import { loadBallotEntry } from "../ballot-entry"
import { COLOR } from "../brand-palette"
import { el, type SatoriNode } from "../share-image"
import { formatCallDate } from "./call-summary"
import { cardFrame, clamp, eyebrow, PERSON_MAX, statCell } from "./frame"

// Same measurements as call-card.ts's pick label, which sits in the same slot
// at the same sizes.
const NAME_HERO_MAX = 22
const NAME_MAX = 42

export type BallotShareCardData = {
	ballotName: string
	leagueAbbr: string
	name: string
	username: string
	calledCount: number
	memberCount: number
	wins: number
	losses: number
	points: number
	// "Locks Sep 14, 2026" / "Awaiting results" - shown in place of the record
	// and points while nothing has settled.
	pendingLabel: string
}

export function buildBallotShareCard(data: BallotShareCardData): SatoriNode {
	const hasSettled = data.wins + data.losses > 0
	const ballotName = clamp(data.ballotName, NAME_MAX)

	const cells: SatoriNode[] = [
		statCell("Called", `${data.calledCount} of ${data.memberCount}`),
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
		eyebrow: `${data.leagueAbbr} · Ballot`,
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
						fontSize: ballotName.length <= NAME_HERO_MAX ? "68px" : "44px",
						lineHeight: 1.1,
						textAlign: "center",
						color: COLOR.ink,
					},
					ballotName,
				),
			],
		),
		cells,
		username: data.username,
	})
}

// Null for an unknown or unpublished ballot, an unknown user, or a user with
// no entry on it.
export async function loadBallotShareCardData(
	ballotSlug: string,
	username: string,
): Promise<BallotShareCardData | null> {
	const [ballot, user] = await Promise.all([
		db.query.ballots.findFirst({
			where: { slug: ballotSlug, status: "published" },
			with: { league: { columns: { abbreviation: true } } },
		}),
		db.query.users.findFirst({ where: { username } }),
	])
	const entry =
		ballot && user ? await loadBallotEntry(ballot.id, user.id) : null
	if (!ballot?.league || !user || !entry) return null

	const [nextLock] = await db
		.select({ locksAt: questions.locksAt })
		.from(ballotQuestions)
		.innerJoin(questions, eq(questions.id, ballotQuestions.questionId))
		.where(
			and(
				eq(ballotQuestions.ballotId, ballot.id),
				gt(questions.locksAt, new Date()),
			),
		)
		.orderBy(asc(questions.locksAt))
		.limit(1)

	return {
		ballotName: ballot.name,
		leagueAbbr: ballot.league.abbreviation.toUpperCase(),
		name: user.name,
		username: user.username,
		calledCount: entry.calledCount,
		memberCount: entry.members.length,
		wins: entry.wins,
		losses: entry.losses,
		points: entry.points,
		pendingLabel: nextLock
			? `Locks ${formatCallDate(nextLock.locksAt)}`
			: "Awaiting results",
	}
}
