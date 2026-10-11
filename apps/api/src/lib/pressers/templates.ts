import { match, P } from "ts-pattern"
import type { PresserAppTemplate } from "../../db/schema"
import type { GameEntryVerdict } from "../game-entry"
import { APP_QUESTION_COUNT } from "./constants"

// One scored call on the game, reduced to what the app's questions ask about.
export type CallFacts = {
	callId: string
	// What was picked, as the call card says it: an option's label, several
	// joined, or a numeric guess.
	pickLabel: string
	won: boolean
	resultPoints: number
	// The highest conviction on the call.
	conviction: number | null
	// The share of the field that picked the same option. Null on a numeric
	// guess and on a call with more than one pick.
	fieldSharePct: number | null
	// Numeric guesses that hit only: the share of the field that guessed at
	// least this close (calls.closenessFieldPct).
	closenessFieldPct: number | null
	// A winner pick that missed: how many points the picked team lost by.
	lostBy: number | null
	// The call's one redo moved it off its original pick.
	redoFlipped: boolean
	// Who faded this call, split by which side the result went to.
	fadersRight: string[]
	fadersWrong: string[]
	// Where this call left its streak, when it was a hit.
	streakLength: number | null
	questionCreatedAt: Date
}

export type PresserFacts = {
	// "DAL @ NYG"
	matchup: string
	wins: number
	losses: number
	points: number
	verdict: GameEntryVerdict | null
	calls: CallFacts[]
}

export type AppQuestionDraft = {
	template: PresserAppTemplate
	callId: string | null
	appKey: string
	body: string
}

const HIGH_CONVICTION = 80
const CONTRARIAN_SHARE_PCT = 20
const CONTRARIAN_CLOSENESS_PCT = 10
const STREAK_MIN = 5

// Highest priority first. A call-level template is tried against every call;
// the first call it fits (most points either way, then oldest question)
// takes it.
const CALL_TEMPLATES = [
	"faded_and_lost",
	"high_conviction_miss",
	"redo_flip_lost",
	"contrarian_hit",
	"contrarian_miss",
	"faders_wrong",
	"streak_extended",
] as const satisfies readonly PresserAppTemplate[]
type CallTemplate = (typeof CALL_TEMPLATES)[number]

export function appKeyFor(
	template: PresserAppTemplate,
	callId: string | null,
): string {
	return `${template}:${callId ?? "game"}`
}

function pct(value: number): string {
	return value < 1 ? "under 1" : String(Math.round(value))
}

// "@jay", "@jay and @sam", "@jay and 3 others"
function namesList(usernames: string[]): string {
	const [first, second, ...rest] = usernames.map((name) => `@${name}`)
	if (!second) return first ?? ""
	if (rest.length === 0) return `${first} and ${second}`
	return `${first} and ${rest.length + 1} others`
}

function signedPoints(points: number): string {
	return points > 0 ? `+${points}` : String(points)
}

// The question a template asks of one call, or null when the call doesn't fit
// it.
function callQuestion(template: CallTemplate, call: CallFacts): string | null {
	return match(template)
		.with("faded_and_lost", () => {
			if (call.won || call.fadersRight.length === 0) return null
			const verb = call.fadersRight.length === 1 ? "was" : "were"
			return `${namesList(call.fadersRight)} faded your ${call.pickLabel} call and ${verb} right. What did they see that you didn't?`
		})
		.with("high_conviction_miss", () => {
			if (call.won || (call.conviction ?? 0) < HIGH_CONVICTION) return null
			const margin = call.lostBy ? ` and they lost by ${call.lostBy}` : ""
			return `You put ${call.conviction} conviction on ${call.pickLabel}${margin}. What happened?`
		})
		.with("redo_flip_lost", () => {
			if (call.won || !call.redoFlipped) return null
			return `You used your redo to switch to ${call.pickLabel}, and it missed. Would you take the redo back?`
		})
		.with("contrarian_hit", () => {
			if (!call.won) return null
			if (
				call.fieldSharePct !== null &&
				call.fieldSharePct <= CONTRARIAN_SHARE_PCT
			) {
				return `Only ${pct(call.fieldSharePct)}% of the field took ${call.pickLabel} with you, and it hit. What did you see that they didn't?`
			}
			if (
				call.closenessFieldPct !== null &&
				call.closenessFieldPct <= CONTRARIAN_CLOSENESS_PCT
			) {
				return `Only ${pct(call.closenessFieldPct)}% of the field guessed as close as your ${call.pickLabel}. How did you land it?`
			}
			return null
		})
		.with("contrarian_miss", () => {
			if (
				call.won ||
				call.fieldSharePct === null ||
				call.fieldSharePct > CONTRARIAN_SHARE_PCT
			) {
				return null
			}
			return `Only ${pct(call.fieldSharePct)}% of the field took ${call.pickLabel}, and it missed. Still think it was the right read?`
		})
		.with("faders_wrong", () => {
			if (!call.won || call.fadersWrong.length === 0) return null
			return `${namesList(call.fadersWrong)} faded your ${call.pickLabel} call and got it wrong. Anything to say to them?`
		})
		.with("streak_extended", () => {
			if (!call.won || (call.streakLength ?? 0) < STREAK_MIN) return null
			return `Your ${call.pickLabel} hit makes it ${call.streakLength} in a row. Is anyone stopping you?`
		})
		.exhaustive()
}

function gameQuestion(facts: PresserFacts): {
	template: PresserAppTemplate
	body: string
} {
	return match(facts.verdict)
		.with("perfect", () => ({
			template: "perfect_game" as const,
			body: `You went ${facts.wins}-0 on ${facts.matchup}. Was there ever any doubt?`,
		}))
		.with("oh_fer", () => ({
			template: "oh_fer_game" as const,
			body: `You went 0-${facts.losses} on ${facts.matchup}. Where did it go wrong?`,
		}))
		.with(P.nullish, () => ({
			template: "game_summary" as const,
			body: `You went ${facts.wins}-${facts.losses} on ${facts.matchup} for ${signedPoints(facts.points)} points. ${facts.points > 0 ? "Which call was your best read?" : "What would you do differently?"}`,
		}))
		.exhaustive()
}

// The questions the app asks at a presser, best first. At most one per call
// and one per template, up to APP_QUESTION_COUNT, and always at least the
// one about the whole game, so no presser opens empty.
export function pickAppQuestions(facts: PresserFacts): AppQuestionDraft[] {
	const ordered = [...facts.calls].sort(
		(a, b) =>
			Math.abs(b.resultPoints) - Math.abs(a.resultPoints) ||
			a.questionCreatedAt.getTime() - b.questionCreatedAt.getTime(),
	)
	const drafts: AppQuestionDraft[] = []
	const usedCalls = new Set<string>()
	// One slot is held back for the game question.
	for (const template of CALL_TEMPLATES) {
		if (drafts.length >= APP_QUESTION_COUNT - 1) break
		for (const call of ordered) {
			if (usedCalls.has(call.callId)) continue
			const body = callQuestion(template, call)
			if (!body) continue
			drafts.push({
				template,
				callId: call.callId,
				appKey: appKeyFor(template, call.callId),
				body,
			})
			usedCalls.add(call.callId)
			break
		}
	}
	const game = gameQuestion(facts)
	drafts.push({
		template: game.template,
		callId: null,
		appKey: appKeyFor(game.template, null),
		body: game.body,
	})
	return drafts
}
