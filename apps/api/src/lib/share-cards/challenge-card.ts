// The og:images behind /challenges/:code and /challenges/:code/vs/:username.
// A challenge's card is the dare: who to beat and what it's over, never the
// creator's picks. A 1v1's receipt shows the two totals and who won.
//
// Built on the shared og:image frame (see frame.ts).
import { questionTitleWithGame } from "@called-my-shot/schemas"
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
import { cardFrame, clamp, eyebrow, PERSON_MAX, statCell } from "./frame"

const TITLES_SHOWN = 2
const TITLES_MAX = 90

export type ChallengeCardData = {
	creatorName: string
	creatorUsername: string
	state: ChallengeState
	questionCount: number
	acceptanceCount: number
	tally: Record3
	// "BUF @ LAR" when every question is on that one game, which then names
	// it once over bare titles. Otherwise each title carries its own game.
	gameLabel: string | null
	titles: string[]
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

export function buildChallengeCard(data: ChallengeCardData): SatoriNode {
	// The dare is the card. The questions are only a line under it, enough
	// to say what's being called.
	const questions = `${data.questionCount} ${data.questionCount === 1 ? "question" : "questions"}`
	const shown = data.titles.slice(0, TITLES_SHOWN)
	const more = data.titles.length - shown.length
	const hero = el(
		"div",
		{
			display: "flex",
			flex: "1",
			flexDirection: "column",
			alignItems: "center",
			justifyContent: "center",
			gap: "18px",
			paddingLeft: "48px",
			paddingRight: "48px",
		},
		[
			el(
				"span",
				{
					display: "flex",
					fontFamily: "Archivo Black",
					fontSize: "76px",
					lineHeight: 1.05,
					color: COLOR.ink,
					textAlign: "center",
				},
				`Can you beat @${clamp(data.creatorUsername, PERSON_MAX)}?`,
			),
			eyebrow(data.gameLabel ? `${questions} on ${data.gameLabel}` : questions),
			el(
				"span",
				{
					display: "flex",
					fontSize: "22px",
					color: COLOR.dim,
					textAlign: "center",
				},
				clamp(
					[...shown, ...(more > 0 ? [`+${more} more`] : [])].join(" · "),
					TITLES_MAX,
				),
			),
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
	const { creator, questions, state, matchups } = loaded

	const titles = await db.query.questions.findMany({
		where: { id: { in: questions.map((q) => q.id) } },
		columns: { id: true, title: true, gameId: true },
		with: {
			game: {
				columns: {},
				with: {
					homeTeam: { columns: { abbreviation: true } },
					awayTeam: { columns: { abbreviation: true } },
				},
			},
		},
	})
	const gameIds = new Set(titles.map((q) => q.gameId))
	const onlyGame =
		gameIds.size === 1 && titles[0]?.gameId ? titles[0].game : null
	const gameLabel =
		onlyGame?.awayTeam && onlyGame.homeTeam
			? `${onlyGame.awayTeam.abbreviation} @ ${onlyGame.homeTeam.abbreviation}`
			: null
	const titleById = new Map(
		titles.map((q) => [
			q.id,
			gameLabel ? q.title : questionTitleWithGame(q.title, q.game),
		]),
	)

	return {
		creatorName: creator.name,
		creatorUsername: creator.username,
		state,
		questionCount: questions.length,
		acceptanceCount: matchups.length,
		tally: creatorTally(matchups),
		gameLabel,
		titles: questions.map((q) => titleById.get(q.id) ?? ""),
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
