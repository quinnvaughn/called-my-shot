import { shuffled } from "../../game-questions/select-templates"
import { played, statOf, type WatchPlayer, type WatchSide } from "../box"
import { count, lastName, possessive, theTeam } from "../names"
import {
	leaderQuestion,
	lineQuestion,
	numberQuestion,
	OPTION_COUNT,
	pickOne,
	placeAnswer,
} from "../options"
import {
	answerPlayer,
	bestQuarter,
	finalScore,
	type WatchTemplate,
} from "./common"

const minutes = (p: WatchPlayer) => statOf(p, "minutes") ?? 0

// Who started. Where the feed didn't say, the five who played the most.
function starters(side: WatchSide): WatchPlayer[] {
	const flagged = side.players.filter((p) => p.starter === true)
	if (flagged.length > 0) return flagged
	return [...played(side)].sort((a, b) => minutes(b) - minutes(a)).slice(0, 5)
}

const leader =
	(key: string, noun: string, unit: string): WatchTemplate =>
	(ctx) =>
		leaderQuestion({
			template: `nba.leader.${key}`,
			prompt: `Who led ${theTeam(ctx.teamInfo.name)} in ${noun}?`,
			side: ctx.team,
			key,
			rng: ctx.rng,
			reveal: (p, value) => `${lastName(p.name)} had ${count(value, unit)}.`,
		})

const starterLine: WatchTemplate = (ctx) => {
	const scorer = answerPlayer(ctx, "nba.leader.points")
	const pick = pickOne(
		starters(ctx.team).filter((p) => p.playerId !== scorer && minutes(p) > 0),
		ctx.rng,
	)
	if (!pick) return null
	const pts = statOf(pick, "points")
	const reb = statOf(pick, "rebounds")
	const ast = statOf(pick, "assists")
	if (pts === null || reb === null || ast === null) return null
	return lineQuestion({
		template: "nba.starter_line",
		prompt: `What was ${possessive(pick.name)} line?`,
		values: [pts, reb, ast],
		spreads: [8, 5, 5],
		format: ([p, r, a]) => `${p} PTS, ${r} REB, ${a} AST`,
		rng: ctx.rng,
		reveal: `${lastName(pick.name)} had ${count(pts, "point")}, ${count(reb, "rebound")} and ${count(ast, "assist")}.`,
	})
}

// One of the bench's three busiest among three starters. Needs the feed to
// say who started: guessing it from minutes would get this wrong.
const bench: WatchTemplate = (ctx) => {
	const starting = ctx.team.players.filter((p) => p.starter === true)
	const reserves = ctx.team.players
		.filter((p) => p.starter === false && minutes(p) > 0)
		.sort((a, b) => minutes(b) - minutes(a))
		.slice(0, 3)
	const pick = pickOne(reserves, ctx.rng)
	if (!pick || starting.length < OPTION_COUNT - 1) return null
	const { options, answer } = placeAnswer(
		{ label: pick.name, playerId: pick.playerId },
		shuffled(starting, ctx.rng)
			.slice(0, OPTION_COUNT - 1)
			.map((p) => ({ label: p.name, playerId: p.playerId })),
		ctx.rng,
	)
	return {
		template: "nba.bench",
		prompt: "Which of these came off the bench?",
		options,
		answer,
		reveal: `${lastName(pick.name)} came off the bench for ${count(statOf(pick, "points") ?? 0, "point")}.`,
	}
}

const THREES = "threePointFieldGoalsMade-threePointFieldGoalsAttempted"

const teamThrees: WatchTemplate = (ctx) => {
	const cell = ctx.team.teamBox.get(THREES)
	if (cell?.num == null) return null
	const [made, tried] = cell.text.split("-")
	return numberQuestion({
		template: "nba.team_threes",
		prompt: `How many threes did ${theTeam(ctx.teamInfo.name)} make?`,
		answer: cell.num,
		spread: 5,
		rng: ctx.rng,
		reveal: `They went ${made} for ${tried}.`,
	})
}

const oppScorer: WatchTemplate = (ctx) =>
	leaderQuestion({
		template: "nba.opp_leader.points",
		prompt: `Who led ${theTeam(ctx.oppInfo.name)} in scoring?`,
		side: ctx.opp,
		key: "points",
		rng: ctx.rng,
		reveal: (p, value) => `${lastName(p.name)} had ${count(value, "point")}.`,
	})

export const NBA_TEMPLATES: WatchTemplate[] = [
	(ctx) => bestQuarter(ctx, "nba.best_quarter"),
	leader("points", "scoring", "point"),
	leader("rebounds", "rebounds", "rebound"),
	leader("assists", "assists", "assist"),
	starterLine,
	bench,
	teamThrees,
	oppScorer,
	finalScore,
]
