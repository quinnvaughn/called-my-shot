// The og:images behind /challenges/:code and /challenges/:code/vs/:username.
// An open or live challenge shows the creator's calls, the dare itself; a
// settled one shows how the creator did against the field. A 1v1's receipt
// shows the two totals and who won.
//
// Built on the shared og:image frame (see frame.ts).
import { db } from "../../db"
import { COLOR } from "../brand-palette"
import { loadChallengeQuestionFacts } from "../challenges/load"
import {
	buildMatchups,
	type ChallengeState,
	challengeState,
	creatorTally,
	loadChallengePoints,
	type MatchupOutcome,
	type Record3,
} from "../challenges/outcome"
import { el, type SatoriNode } from "../share-image"
import { loadCallSummaries } from "./call-summary"
import { cardFrame, clamp, eyebrow, PERSON_MAX, statCell } from "./frame"

const ROWS_SHOWN = 4
const TITLE_MAX = 60
const PICK_MAX = 30

export type ChallengeCardData = {
	creatorName: string
	creatorUsername: string
	state: ChallengeState
	questionCount: number
	acceptanceCount: number
	tally: Record3
	rows: { title: string; pick: string | null }[]
}

export type MatchupCardData = {
	creatorUsername: string
	acceptorUsername: string
	creatorPoints: number
	acceptorPoints: number
	outcome: MatchupOutcome | null
	questionCount: number
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
const recordText = ({ wins, losses, draws }: Record3) =>
	draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`

function questionRow(row: { title: string; pick: string | null }): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			justifyContent: "space-between",
			gap: "24px",
			paddingBottom: "10px",
			borderBottom: `1px solid ${COLOR.border}`,
		},
		[
			el(
				"span",
				{ display: "flex", fontSize: "24px", color: COLOR.linen },
				clamp(row.title, TITLE_MAX),
			),
			el(
				"span",
				{
					display: "flex",
					flexShrink: 0,
					fontSize: "24px",
					fontWeight: 600,
					color: row.pick ? COLOR.ink : COLOR.dim,
				},
				row.pick ? clamp(row.pick, PICK_MAX) : "No call yet",
			),
		],
	)
}

export function buildChallengeCard(data: ChallengeCardData): SatoriNode {
	const shown = data.rows.slice(0, ROWS_SHOWN)
	const more = data.rows.length - shown.length
	const hero = el(
		"div",
		{
			display: "flex",
			flex: "1",
			overflow: "hidden",
			flexDirection: "column",
			justifyContent: "center",
			gap: "12px",
		},
		[
			eyebrow(`@${data.creatorUsername}'s calls`),
			...shown.map(questionRow),
			...(more > 0 ? [eyebrow(`+${more} more`)] : []),
		],
	)
	const settled = data.state === "settled"
	return cardFrame({
		eyebrow: `${clamp(data.creatorName, PERSON_MAX)} · Challenge`,
		hero,
		cells: [
			statCell("Questions", String(data.questionCount), { big: true }),
			statCell("Took it on", String(data.acceptanceCount)),
			settled
				? statCell("Record", recordText(data.tally), { color: COLOR.secondary })
				: statCell(
						"Status",
						data.state === "open"
							? "Open"
							: data.state === "live"
								? "Playing"
								: "Voided",
					),
		],
		username: data.creatorUsername,
	})
}

export function buildMatchupCard(data: MatchupCardData): SatoriNode {
	const side = (username: string, points: number, won: boolean) =>
		el(
			"div",
			{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "6px",
			},
			[
				el(
					"span",
					{ display: "flex", fontSize: "30px", color: COLOR.linen },
					`@${clamp(username, PERSON_MAX)}`,
				),
				el(
					"span",
					{
						display: "flex",
						fontFamily: "Archivo Black",
						fontSize: "72px",
						color: won ? COLOR.success : COLOR.ink,
					},
					signed(points),
				),
			],
		)
	const hero = el(
		"div",
		{
			display: "flex",
			flex: "1",
			alignItems: "center",
			justifyContent: "center",
			gap: "64px",
		},
		[
			side(
				data.creatorUsername,
				data.creatorPoints,
				data.outcome === "creator",
			),
			el("span", { display: "flex", fontSize: "28px", color: COLOR.dim }, "vs"),
			side(
				data.acceptorUsername,
				data.acceptorPoints,
				data.outcome === "acceptor",
			),
		],
	)
	const result =
		data.outcome === null
			? "Playing out"
			: data.outcome === "draw"
				? "Draw"
				: `@${data.outcome === "creator" ? data.creatorUsername : data.acceptorUsername} won`
	return cardFrame({
		eyebrow: "Challenge 1v1",
		hero,
		cells: [
			statCell("Result", result, { big: true }),
			statCell("Questions", String(data.questionCount)),
		],
		byline: `@${data.creatorUsername} vs @${data.acceptorUsername}`,
	})
}

async function loadChallenge(code: string) {
	const challenge = await db.query.challenges.findFirst({
		where: { code: code.toUpperCase() },
		with: { creator: { columns: { name: true, username: true } } },
	})
	if (!challenge?.creator) return null
	const questions =
		(await loadChallengeQuestionFacts([challenge.id])).get(challenge.id) ?? []
	const acceptances = await db.query.challengeAcceptances.findMany({
		where: { challengeId: challenge.id },
		with: { acceptor: { columns: { username: true } } },
	})
	const state = challengeState(questions)
	const pointsOf = await loadChallengePoints(
		[challenge.id],
		[challenge.creatorId, ...acceptances.map((a) => a.acceptorId)],
	)
	const matchups = buildMatchups({
		challengeId: challenge.id,
		creatorId: challenge.creatorId,
		state,
		acceptances,
		pointsOf,
	})
	return { challenge, creator: challenge.creator, questions, state, matchups }
}

// Null for an unknown code, so the route 404s.
export async function loadChallengeCardData(
	code: string,
): Promise<ChallengeCardData | null> {
	const loaded = await loadChallenge(code)
	if (!loaded) return null
	const { challenge, creator, questions, state, matchups } = loaded

	const [titles, calls] = await Promise.all([
		db.query.questions.findMany({
			where: { id: { in: questions.map((q) => q.id) } },
			columns: { id: true, title: true },
		}),
		db.query.calls.findMany({
			where: {
				userId: challenge.creatorId,
				questionId: { in: questions.map((q) => q.id) },
			},
			columns: { id: true, questionId: true },
		}),
	])
	const summaries = await loadCallSummaries(calls.map((c) => c.id))
	const titleById = new Map(titles.map((q) => [q.id, q.title]))
	const pickByQuestionId = new Map(
		calls.map((c) => [c.questionId, summaries.get(c.id)?.pickLabel ?? null]),
	)

	return {
		creatorName: creator.name,
		creatorUsername: creator.username,
		state,
		questionCount: questions.length,
		acceptanceCount: matchups.length,
		tally: creatorTally(matchups),
		rows: questions.map((q) => ({
			title: titleById.get(q.id) ?? "",
			pick: pickByQuestionId.get(q.id) ?? null,
		})),
	}
}

// Null for an unknown code, or someone who didn't take it on.
export async function loadMatchupCardData(
	code: string,
	username: string,
): Promise<MatchupCardData | null> {
	const loaded = await loadChallenge(code)
	if (!loaded) return null
	const matchup = loaded.matchups.find(
		(m) => m.acceptance.acceptor?.username === username,
	)
	if (!matchup?.acceptance.acceptor) return null
	return {
		creatorUsername: loaded.creator.username,
		acceptorUsername: matchup.acceptance.acceptor.username,
		creatorPoints: matchup.creator.total,
		acceptorPoints: matchup.acceptor.total,
		outcome: matchup.outcome,
		questionCount: loaded.questions.length,
	}
}
