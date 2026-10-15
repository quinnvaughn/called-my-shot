import { match } from "ts-pattern"
import type { QuestionStatus } from "#/graphql/generated/graphql"

// pending: still out there. live: still out there and waiting on something
// right now, marked with a pulsing dot. neutral: a state with no result to
// colour, like Locked or Voided.
export type RecordTone = "pending" | "live" | "success" | "danger" | "neutral"

// What the corner tag says about a call, here and on CallCard in a feed, so
// the two never describe the same result in different words. isWin is null
// until the call settles; until then the tag names the question's state,
// since Open (the field, and so the payout, can still move) and Locked
// (every pick is frozen until the result) are different things to be waiting
// on. An exact guess keeps "Nailed it" over any margin label: it is the
// rarer claim, and a second superlative next to it reads as two prizes for
// one result.
export function recordTagFor({
	status,
	isWin,
	nailed,
	marginLabel,
	streakLength,
}: {
	status: QuestionStatus
	isWin: boolean | null
	nailed: boolean
	marginLabel: string | null
	streakLength: number | null
}): { tone: RecordTone; label: string } {
	if (isWin === null) {
		return {
			tone: "pending",
			// A settled question with no result for this call means
			// resolution left it out of scoring.
			label: match(status)
				.with("OPEN", () => "Open")
				.with("LOCKED", () => "Locked")
				.with("VOIDED", () => "Voided")
				.with("RESOLVED", "DISPUTED", () => "Not scored")
				.exhaustive(),
		}
	}
	const verdict = nailed
		? "Nailed it"
		: (marginLabel ?? (isWin ? "Called it" : "Missed"))
	return {
		tone: isWin ? "success" : "danger",
		label:
			isWin && streakLength !== null
				? `${verdict} · ${streakLength} in a row`
				: verdict,
	}
}
