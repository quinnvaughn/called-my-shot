import { played, statOf, type WatchPlayer } from "../box"
import { count, lastName, possessive, theTeam } from "../names"
import {
	leaderQuestion,
	lineQuestion,
	numberQuestion,
	presenceQuestion,
} from "../options"
import {
	answerPlayer,
	bestQuarter,
	finalScore,
	type TemplateContext,
	type WatchTemplate,
} from "./common"

const PASSING = "passing.completions/passingAttempts"

// "22/31" -> [22, 31].
function completions(player: WatchPlayer): [number, number] | null {
	const [made, tried] = (player.stats.get(PASSING)?.text ?? "")
		.split("/")
		.map(Number)
	return Number.isFinite(made) && Number.isFinite(tried) && tried
		? [made as number, tried]
		: null
}

const leader = (
	ctx: TemplateContext,
	key: string,
	prompt: string,
	unit: [string, string?],
) =>
	leaderQuestion({
		template: `nfl.leader.${key}`,
		prompt,
		side: ctx.team,
		key,
		rng: ctx.rng,
		reveal: (p, value) => `${lastName(p.name)} had ${count(value, ...unit)}.`,
	})

const qbLine: WatchTemplate = (ctx) => {
	const passers = played(ctx.team).flatMap((player) => {
		const line = completions(player)
		return line ? [{ player, line }] : []
	})
	const qb = passers.sort((a, b) => b.line[1] - a.line[1])[0]
	if (!qb) return null
	const yards = statOf(qb.player, "passing.passingYards")
	const tds = statOf(qb.player, "passing.passingTouchdowns")
	const ints = statOf(qb.player, "passing.interceptions")
	if (yards === null || tds === null || ints === null) return null
	const [made, tried] = qb.line
	return lineQuestion({
		template: "nfl.qb_line",
		prompt: `What was ${possessive(qb.player.name)} passing line?`,
		values: [made, tried, yards, tds, ints],
		spreads: [3, 0, 45, 1, 1],
		valid: ([c, a]) => (c ?? 0) <= (a ?? 0),
		format: ([c, a, y, t, i]) => `${c}/${a}, ${y} YDS, ${t} TD, ${i} INT`,
		rng: ctx.rng,
		reveal: `${lastName(qb.player.name)} went ${made} of ${tried} for ${count(yards, "yard")}.`,
	})
}

const touchdowns = (p: WatchPlayer) =>
	(statOf(p, "rushing.rushingTouchdowns") ?? 0) +
	(statOf(p, "receiving.receivingTouchdowns") ?? 0)

// Anyone who carried or caught it.
const ballCarriers = (ctx: TemplateContext) =>
	played(ctx.team).filter(
		(p) =>
			statOf(p, "rushing.rushingAttempts") !== null ||
			statOf(p, "receiving.receptions") !== null,
	)

const scoredTouchdown: WatchTemplate = (ctx) =>
	presenceQuestion({
		template: "nfl.scored_td",
		prompt: `Which of these scored a touchdown for ${theTeam(ctx.teamInfo.name)}?`,
		candidates: ballCarriers(ctx),
		did: (p) => touchdowns(p) > 0,
		rng: ctx.rng,
		reveal: (p) => {
			const n = touchdowns(p)
			return `${lastName(p.name)} scored ${n === 1 ? "one" : n}.`
		},
	})

const receptions: WatchTemplate = (ctx) => {
	const question = leader(
		ctx,
		"receiving.receptions",
		`Who caught the most passes for ${theTeam(ctx.teamInfo.name)}?`,
		["catch", "catches"],
	)
	const same =
		question?.options[question.answer]?.playerId ===
		answerPlayer(ctx, "nfl.leader.receiving.receivingYards")
	return same ? null : question
}

const teamYards: WatchTemplate = (ctx) => {
	const yards = ctx.team.teamBox.get("totalYards")?.num
	if (yards == null) return null
	return numberQuestion({
		template: "nfl.team_yards",
		prompt: `How many total yards did ${theTeam(ctx.teamInfo.name)} gain?`,
		answer: yards,
		spread: 60,
		minGap: 12,
		rng: ctx.rng,
		reveal: `They gained ${count(yards, "yard")}.`,
	})
}

const oppReceiver: WatchTemplate = (ctx) =>
	leaderQuestion({
		template: "nfl.opp_leader.receivingYards",
		prompt: `Who led ${theTeam(ctx.oppInfo.name)} in receiving yards?`,
		side: ctx.opp,
		key: "receiving.receivingYards",
		rng: ctx.rng,
		reveal: (p, value) => `${lastName(p.name)} had ${count(value, "yard")}.`,
	})

export const NFL_TEMPLATES: WatchTemplate[] = [
	(ctx) => bestQuarter(ctx, "nfl.best_quarter"),
	qbLine,
	(ctx) =>
		leader(
			ctx,
			"rushing.rushingYards",
			`Who led ${theTeam(ctx.teamInfo.name)} in rushing yards?`,
			["yard"],
		),
	(ctx) =>
		leader(
			ctx,
			"receiving.receivingYards",
			`Who led ${theTeam(ctx.teamInfo.name)} in receiving yards?`,
			["yard"],
		),
	receptions,
	scoredTouchdown,
	(ctx) =>
		leader(
			ctx,
			"defensive.totalTackles",
			`Who led ${theTeam(ctx.teamInfo.name)} in tackles?`,
			["tackle"],
		),
	teamYards,
	oppReceiver,
	finalScore,
]
