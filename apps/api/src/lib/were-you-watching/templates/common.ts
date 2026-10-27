import type { WatchQuestion } from "../../../db/schema"
import { shuffled } from "../../game-questions/select-templates"
import type { WatchSide } from "../box"
import { ordinal, teamNickname, theTeam } from "../names"
import { choiceQuestion, OPTION_COUNT, pickOne } from "../options"

export type WatchLeagueSlug = "nba" | "nfl" | "mlb" | "nhl"

export type WatchTeamInfo = { name: string; abbreviation: string }

// Everything a template reads, from the quiz team's side.
export type TemplateContext = {
	league: WatchLeagueSlug
	team: WatchSide
	opp: WatchSide
	teamInfo: WatchTeamInfo
	oppInfo: WatchTeamInfo
	// ESPN's "Final/OT", "Final/SO"; null when it said plain "Final".
	statusDetail: string | null
	rng: () => number
	// The questions already picked, ahead of this one.
	chosen: WatchQuestion[]
}

// Null when the box score can't support it: a missing stat, a tie at the
// top, too few players to make four choices.
export type WatchTemplate = (ctx: TemplateContext) => WatchQuestion | null

// The player a chosen question's answer is, for a later one that would only
// ask about the same person again.
export function answerPlayer(
	ctx: TemplateContext,
	template: string,
): string | null {
	const question = ctx.chosen.find((q) => q.template === template)
	return question?.options[question.answer]?.playerId ?? null
}

// Which of the first four periods the team won by the most. Only asked when
// one period clearly was: a tie, or no period won at all, has no answer.
export function bestQuarter(
	ctx: TemplateContext,
	template: string,
): WatchQuestion | null {
	const quarters = [1, 2, 3, 4].map((n) => ({
		own: ctx.team.periods.find((p) => p.key === String(n))?.score,
		theirs: ctx.opp.periods.find((p) => p.key === String(n))?.score,
	}))
	const margins = quarters.flatMap((q) =>
		q.own === undefined || q.theirs === undefined ? [] : [q.own - q.theirs],
	)
	if (margins.length < quarters.length) return null
	const best = Math.max(...margins)
	if (best <= 0 || margins.filter((m) => m === best).length > 1) return null
	const index = margins.indexOf(best)
	const own = quarters[index]?.own ?? 0
	return choiceQuestion({
		template,
		prompt: `Which quarter did ${theTeam(ctx.teamInfo.name)} win by the most?`,
		labels: [1, 2, 3, 4].map((n) => `${ordinal(n)} quarter`),
		answer: index,
		reveal: `They took the ${ordinal(index + 1)} ${own}-${own - best}.`,
	})
}

// The one period the team scored the most in, among three others it played.
export function bestPeriod(
	ctx: TemplateContext,
	args: { template: string; noun: string; verb: string },
): WatchQuestion | null {
	const periods = ctx.team.periods.filter((p) => p.key !== "SO")
	const best = Math.max(...periods.map((p) => p.score))
	const top = periods.filter((p) => p.score === best)
	const answer = top[0]
	if (!answer || best <= 0 || top.length > 1) return null
	const others = shuffled(
		periods.filter((p) => p !== answer),
		ctx.rng,
	).slice(0, OPTION_COUNT - 1)
	if (others.length < OPTION_COUNT - 1) return null
	const shown = [answer, ...others].sort(
		(a, b) => Number(a.key) - Number(b.key),
	)
	return choiceQuestion({
		template: args.template,
		prompt: `In which ${args.noun} did ${theTeam(ctx.teamInfo.name)} ${args.verb} the most?`,
		labels: shown.map((p) => `${ordinal(Number(p.key))} ${args.noun}`),
		answer: shown.indexOf(answer),
		reveal: `They put up ${best} in the ${ordinal(Number(answer.key))}.`,
	})
}

// How far each side's score can move in a wrong final. NFL scores move in
// the sizes points come in.
const SCORE_DELTAS: Record<WatchLeagueSlug, number[]> = {
	nba: [-12, -9, -7, -5, -4, -3, -2, 0, 2, 3, 4, 5, 7, 9, 12],
	nfl: [-10, -7, -6, -4, -3, 0, 3, 4, 6, 7, 10],
	mlb: [-2, -1, 0, 1, 2],
	nhl: [-2, -1, 0, 1, 2],
}

function overtimeTag(statusDetail: string | null): string {
	if (!statusDetail) return ""
	if (statusDetail.endsWith("/SO")) return " (SO)"
	return /\/\d?OT$/.test(statusDetail) ? " (OT)" : ""
}

// The final score, among three wrong ones with the same winner. Every
// choice carries the same overtime tag, so it gives nothing away.
export const finalScore: WatchTemplate = (ctx) => {
	const own = ctx.team.score
	const theirs = ctx.opp.score
	if (own === null || theirs === null || own === theirs) return null
	const won = own > theirs
	const tag = overtimeTag(ctx.statusDetail)
	const label = (a: number, b: number) =>
		`${ctx.teamInfo.abbreviation} ${a}, ${ctx.oppInfo.abbreviation} ${b}${tag}`
	const deltas = SCORE_DELTAS[ctx.league]
	const correct = label(own, theirs)
	const labels = new Set([correct])
	for (let i = 0; i < 200 && labels.size < OPTION_COUNT; i++) {
		const a = own + (pickOne(deltas, ctx.rng) ?? 0)
		const b = theirs + (pickOne(deltas, ctx.rng) ?? 0)
		if (a < 0 || b < 0 || a === b || a > b !== won) continue
		labels.add(label(a, b))
	}
	if (labels.size < OPTION_COUNT) return null
	const options = shuffled([...labels], ctx.rng).map((l) => ({
		label: l,
		playerId: null,
	}))
	return {
		template: "final_score",
		prompt: "What was the final score?",
		options,
		answer: options.findIndex((o) => o.label === correct),
		reveal: `The ${teamNickname(ctx.teamInfo.name)} ${won ? "won" : "lost"} ${Math.max(own, theirs)}-${Math.min(own, theirs)}.`,
	}
}
