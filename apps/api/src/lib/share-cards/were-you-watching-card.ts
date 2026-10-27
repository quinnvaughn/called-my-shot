// Were You Watching?'s og:images. A team's quiz (/arcade/were-you-watching/
// :league/:team) is the matchup and how many questions are waiting; a
// result (.../:code/:result) is how many the sharer got and how fast, with
// a Clean run chip when they stayed on the page.

import { arcadeDay } from "../arcade/day"
import { COLOR } from "../brand-palette"
import { el, image, type SatoriNode } from "../share-image"
import { QUESTION_MS } from "../were-you-watching/leagues"
import {
	findCurrentWatchQuiz,
	findTeamBySlugs,
	findWatchQuizByCode,
	type LoadedWatchQuiz,
	verifiedWatchSharer,
} from "../were-you-watching/load"
import { possessive, teamNickname } from "../were-you-watching/names"
import { parseWatchResultCode } from "../were-you-watching/play"
import {
	type ArcadePanel,
	arcadeCard,
	arcadeHeadline,
	arcadeSubline,
} from "./arcade-frame"
import { logoDataUri } from "./team-logo"

const LOGO_PX = 88

type CardTeam = { abbreviation: string; logo: string | null }

export type WatchQuizCardData = {
	day: string
	league: string
	team: CardTeam
	opponent: CardTeam
	teamName: string
	opponentName: string
	questionCount: number
}

export type WatchResultCardData = WatchQuizCardData & {
	correct: number
	total: number
	seconds: number
	clean: boolean
	sharer: string | null
}

function panel(data: WatchQuizCardData): ArcadePanel {
	return {
		color: COLOR.watch,
		title: ["WERE YOU", "WATCHING?"],
		titlePx: 48,
		rule: `Questions on your team's last game. Four choices, ${QUESTION_MS / 1000} seconds each.`,
		day: data.day,
		league: data.league,
	}
}

function logo(team: CardTeam): SatoriNode {
	if (team.logo)
		return image(team.logo, LOGO_PX, LOGO_PX, { objectFit: "contain" })
	return el(
		"div",
		{
			display: "flex",
			width: `${LOGO_PX}px`,
			height: `${LOGO_PX}px`,
			alignItems: "center",
			justifyContent: "center",
			borderRadius: "999px",
			backgroundColor: COLOR.cardMuted,
			border: `2px solid ${COLOR.borderEmphasized}`,
			fontFamily: "Space Mono",
			fontWeight: 700,
			fontSize: "26px",
			color: COLOR.ink,
		},
		team.abbreviation,
	)
}

// Both logos with the abbreviations between: "BOS vs NYK".
function matchup(data: WatchQuizCardData): SatoriNode {
	return el("div", { display: "flex", alignItems: "center", gap: "20px" }, [
		logo(data.team),
		el(
			"span",
			{
				display: "flex",
				fontFamily: "Space Mono",
				fontWeight: 700,
				fontSize: "30px",
				color: COLOR.linen,
			},
			`${data.team.abbreviation} vs ${data.opponent.abbreviation}`,
		),
		logo(data.opponent),
	])
}

function chip(text: string, color: string): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			padding: "8px 18px",
			borderRadius: "999px",
			backgroundColor: COLOR.cardMuted,
			border: `1px solid ${COLOR.border}`,
			fontFamily: "Space Mono",
			fontWeight: 700,
			fontSize: "26px",
			color,
		},
		text,
	)
}

export function buildWatchQuizCard(data: WatchQuizCardData): SatoriNode {
	return arcadeCard(
		panel(data),
		matchup(data),
		el("div", { display: "flex", flexDirection: "column", gap: "14px" }, [
			arcadeHeadline(`${data.questionCount} QUESTIONS`),
			arcadeSubline(
				`On the ${possessive(teamNickname(data.teamName))} game against the ${teamNickname(data.opponentName)}.`,
			),
		]),
	)
}

export function buildWatchResultCard(data: WatchResultCardData): SatoriNode {
	return arcadeCard(
		panel(data),
		matchup(data),
		el("div", { display: "flex", flexDirection: "column", gap: "18px" }, [
			arcadeHeadline(`${data.correct} OF ${data.total}`),
			el("div", { display: "flex", gap: "12px" }, [
				chip(`${data.seconds.toFixed(1)}s`, COLOR.ink),
				...(data.clean ? [chip("Clean run", COLOR.secondary)] : []),
			]),
			...(data.sharer ? [arcadeSubline(`@${data.sharer}`)] : []),
		]),
	)
}

async function cardData(quiz: LoadedWatchQuiz): Promise<WatchQuizCardData> {
	const [teamLogo, opponentLogo] = await Promise.all([
		logoDataUri(quiz.team.logoUrl),
		logoDataUri(quiz.opponent.logoUrl),
	])
	return {
		day: arcadeDay(quiz.gameStartsAt),
		league: quiz.league.abbreviation,
		team: { abbreviation: quiz.team.abbreviation, logo: teamLogo },
		opponent: { abbreviation: quiz.opponent.abbreviation, logo: opponentLogo },
		teamName: quiz.team.name,
		opponentName: quiz.opponent.name,
		questionCount: quiz.questions.length,
	}
}

// The team's current quiz. Null for a team that has none.
export async function loadWatchQuizCardData(
	leagueSlug: string,
	teamSlug: string,
): Promise<WatchQuizCardData | null> {
	const team = await findTeamBySlugs(leagueSlug, teamSlug)
	const quiz = team ? await findCurrentWatchQuiz(team.id) : null
	return quiz ? cardData(quiz) : null
}

export async function loadWatchResultCardData(
	leagueSlug: string,
	teamSlug: string,
	code: string,
	result: string,
	by?: string,
): Promise<WatchResultCardData | null> {
	const parsed = parseWatchResultCode(result)
	if (!parsed) return null
	const team = await findTeamBySlugs(leagueSlug, teamSlug)
	const quiz = team ? await findWatchQuizByCode(team.id, code) : null
	if (!quiz) return null
	const sharer = by ? await verifiedWatchSharer(quiz, by, result) : null
	return {
		...(await cardData(quiz)),
		correct: parsed.correct,
		total: parsed.total,
		seconds: parsed.seconds,
		clean: parsed.clean,
		sharer: sharer?.username ?? null,
	}
}
