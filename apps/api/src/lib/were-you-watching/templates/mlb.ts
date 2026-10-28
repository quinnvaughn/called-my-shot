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
	bestPeriod,
	finalScore,
	type TemplateContext,
	type WatchTemplate,
} from "./common"

// ESPN's MLB box score reports avg, onBasePct, slugAvg, ERA and WHIP
// season-to-date (see db/schema/box-scores.ts), so nothing here reads them.

const INNINGS = "pitching.fullInnings.partInnings"

const batters = (ctx: TemplateContext) =>
	played(ctx.team).filter((p) => statOf(p, "batting.atBats") !== null)

// Pitchers by innings, most first.
const pitchers = (ctx: TemplateContext) =>
	played(ctx.team)
		.filter((p) => statOf(p, INNINGS) !== null)
		.sort((a, b) => (statOf(b, INNINGS) ?? 0) - (statOf(a, INNINGS) ?? 0))

const innings = (p: WatchPlayer) => p.stats.get(INNINGS)?.text ?? "0.0"

const batterLeader = (
	ctx: TemplateContext,
	key: string,
	prompt: string,
	unit: string,
) =>
	leaderQuestion({
		template: `mlb.leader.${key}`,
		prompt,
		side: ctx.team,
		key,
		rng: ctx.rng,
		reveal: (p, value) => `${lastName(p.name)} had ${count(value, unit)}.`,
	})

const homered: WatchTemplate = (ctx) =>
	presenceQuestion({
		template: "mlb.homer",
		prompt: `Which of these homered for ${theTeam(ctx.teamInfo.name)}?`,
		candidates: batters(ctx),
		did: (p) => (statOf(p, "batting.homeRuns") ?? 0) > 0,
		rng: ctx.rng,
		reveal: (p) => {
			const n = statOf(p, "batting.homeRuns") ?? 0
			return `${lastName(p.name)} hit ${n === 1 ? "one" : n}.`
		},
	})

const mostInnings: WatchTemplate = (ctx) =>
	leaderQuestion({
		template: "mlb.most_innings",
		prompt: `Who pitched the most innings for ${theTeam(ctx.teamInfo.name)}?`,
		side: { ...ctx.team, players: pitchers(ctx) },
		key: INNINGS,
		minValue: 0.1,
		rng: ctx.rng,
		reveal: (p) => `${lastName(p.name)} went ${innings(p)} innings.`,
	})

const pitcherLine: WatchTemplate = (ctx) => {
	const [pitcher] = pitchers(ctx)
	if (!pitcher) return null
	const hits = statOf(pitcher, "pitching.hits")
	const runs = statOf(pitcher, "pitching.earnedRuns")
	const ks = statOf(pitcher, "pitching.strikeouts")
	if (hits === null || runs === null || ks === null) return null
	const ip = innings(pitcher)
	return lineQuestion({
		template: "mlb.pitcher_line",
		prompt: `What was ${possessive(pitcher.name)} line?`,
		values: [hits, runs, ks],
		spreads: [4, 3, 4],
		format: ([h, er, k]) => `${ip} IP, ${h} H, ${er} ER, ${k} K`,
		rng: ctx.rng,
		reveal: `${lastName(pitcher.name)} gave up ${count(runs, "earned run")} on ${count(hits, "hit")} and struck out ${ks}.`,
	})
}

const strikeouts: WatchTemplate = (ctx) => {
	const question = leaderQuestion({
		template: "mlb.leader.pitching.strikeouts",
		prompt: `Which pitcher struck out the most for ${theTeam(ctx.teamInfo.name)}?`,
		side: { ...ctx.team, players: pitchers(ctx) },
		key: "pitching.strikeouts",
		rng: ctx.rng,
		reveal: (p, value) => `${lastName(p.name)} struck out ${value}.`,
	})
	const same =
		question?.options[question.answer]?.playerId ===
		answerPlayer(ctx, "mlb.most_innings")
	return same ? null : question
}

const teamHits: WatchTemplate = (ctx) => {
	const hits = ctx.team.tableTotals.get("batting.hits")?.num
	if (hits == null) return null
	return numberQuestion({
		template: "mlb.team_hits",
		prompt: `How many hits did ${theTeam(ctx.teamInfo.name)} have?`,
		answer: hits,
		spread: 4,
		rng: ctx.rng,
		reveal: `They had ${count(hits, "hit")}.`,
	})
}

const oppHits: WatchTemplate = (ctx) =>
	leaderQuestion({
		template: "mlb.opp_leader.batting.hits",
		prompt: `Who had the most hits for ${theTeam(ctx.oppInfo.name)}?`,
		side: ctx.opp,
		key: "batting.hits",
		rng: ctx.rng,
		reveal: (p, value) => `${lastName(p.name)} had ${count(value, "hit")}.`,
	})

export const MLB_TEMPLATES: WatchTemplate[] = [
	(ctx) =>
		bestPeriod(ctx, {
			template: "mlb.big_inning",
			noun: "inning",
			verb: "score",
		}),
	homered,
	(ctx) =>
		batterLeader(
			ctx,
			"batting.hits",
			`Who had the most hits for ${theTeam(ctx.teamInfo.name)}?`,
			"hit",
		),
	(ctx) =>
		batterLeader(
			ctx,
			"batting.RBIs",
			`Who drove in the most runs for ${theTeam(ctx.teamInfo.name)}?`,
			"RBI",
		),
	mostInnings,
	pitcherLine,
	strikeouts,
	teamHits,
	oppHits,
	finalScore,
]
