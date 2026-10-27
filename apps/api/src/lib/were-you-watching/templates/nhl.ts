import { played, statOf, type WatchSide } from "../box"
import { count, lastName, theTeam } from "../names"
import { leaderQuestion, numberQuestion, presenceQuestion } from "../options"
import { finalScore, type TemplateContext, type WatchTemplate } from "./common"

const skaters = (side: WatchSide) =>
	played(side).filter((p) => statOf(p, "skaters.timeOnIce") !== null)

const scored = (
	side: WatchSide,
	name: string,
	template: string,
	ctx: TemplateContext,
) =>
	presenceQuestion({
		template,
		prompt: `Which of these scored for ${theTeam(name)}?`,
		candidates: skaters(side),
		did: (p) => (statOf(p, "skaters.goals") ?? 0) > 0,
		rng: ctx.rng,
		reveal: (p) => {
			const n = statOf(p, "skaters.goals") ?? 0
			return `${lastName(p.name)} scored ${n === 1 ? "one" : n}.`
		},
	})

const skaterLeader = (
	ctx: TemplateContext,
	key: string,
	prompt: string,
	reveal: (last: string, text: string) => string,
) =>
	leaderQuestion({
		template: `nhl.leader.${key}`,
		prompt,
		side: { ...ctx.team, players: skaters(ctx.team) },
		key,
		rng: ctx.rng,
		reveal: (p) => reveal(lastName(p.name), p.stats.get(key)?.text ?? ""),
	})

const goalieSaves: WatchTemplate = (ctx) => {
	const [goalie] = played(ctx.team)
		.filter((p) => statOf(p, "goalies.saves") !== null)
		.sort(
			(a, b) =>
				(statOf(b, "goalies.timeOnIce") ?? 0) -
				(statOf(a, "goalies.timeOnIce") ?? 0),
		)
	const saves = goalie ? statOf(goalie, "goalies.saves") : null
	if (!goalie || saves === null) return null
	const faced = statOf(goalie, "goalies.shotsAgainst")
	return numberQuestion({
		template: "nhl.goalie_saves",
		prompt: `How many saves did ${goalie.name} make?`,
		answer: saves,
		spread: 8,
		minGap: 2,
		rng: ctx.rng,
		reveal:
			faced === null
				? `${lastName(goalie.name)} made ${count(saves, "save")}.`
				: `${lastName(goalie.name)} stopped ${saves} of ${faced}.`,
	})
}

const powerPlayGoals: WatchTemplate = (ctx) => {
	const goals = ctx.team.teamBox.get("powerPlayGoals")?.num
	const chances = ctx.team.teamBox.get("powerPlayOpportunities")?.num
	if (goals == null || chances == null) return null
	return numberQuestion({
		template: "nhl.power_play_goals",
		prompt: `How many power play goals did ${theTeam(ctx.teamInfo.name)} score?`,
		answer: goals,
		spread: 3,
		rng: ctx.rng,
		reveal: `They went ${goals} for ${chances}.`,
	})
}

const teamShots: WatchTemplate = (ctx) => {
	const shots = ctx.team.teamBox.get("shotsTotal")?.num
	if (shots == null) return null
	return numberQuestion({
		template: "nhl.team_shots",
		prompt: `How many shots did ${theTeam(ctx.teamInfo.name)} put on goal?`,
		answer: shots,
		spread: 8,
		minGap: 2,
		rng: ctx.rng,
		reveal: `They had ${count(shots, "shot")}.`,
	})
}

export const NHL_TEMPLATES: WatchTemplate[] = [
	(ctx) => scored(ctx.team, ctx.teamInfo.name, "nhl.who_scored", ctx),
	(ctx) =>
		skaterLeader(
			ctx,
			"skaters.shotsTotal",
			`Who led ${theTeam(ctx.teamInfo.name)} in shots?`,
			(last, text) => `${last} had ${count(Number(text), "shot")}.`,
		),
	(ctx) =>
		skaterLeader(
			ctx,
			"skaters.timeOnIce",
			`Who played the most minutes for ${theTeam(ctx.teamInfo.name)}?`,
			(last, text) => `${last} played ${text}.`,
		),
	(ctx) =>
		skaterLeader(
			ctx,
			"skaters.hits",
			`Who led ${theTeam(ctx.teamInfo.name)} in hits?`,
			(last, text) => `${last} threw ${count(Number(text), "hit")}.`,
		),
	goalieSaves,
	powerPlayGoals,
	teamShots,
	(ctx) => scored(ctx.opp, ctx.oppInfo.name, "nhl.opp_who_scored", ctx),
	finalScore,
]
