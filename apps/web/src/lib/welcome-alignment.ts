import { match } from "ts-pattern"
import type {
	CalledPick,
	CastCallBucket,
} from "#/components/questions/cast-call-form/use-cast-call-form"

// How a new member's first call lines up with the call of the person who
// invited them, for the welcome modal's last step.
export type Alignment =
	| { kind: "same" }
	| { kind: "different" }
	| { kind: "overlap"; shared: number; total: number }
	| { kind: "gap"; gap: number }

export function compareWithInviter(
	mine: CalledPick,
	theirs: CalledPick,
	bucket: CastCallBucket,
): Alignment {
	return match(bucket)
		.with(
			"numeric",
			(): Alignment => ({
				kind: "gap",
				gap: Math.abs((mine.guessValue ?? 0) - (theirs.guessValue ?? 0)),
			}),
		)
		.with("multi", (): Alignment => {
			const theirSet = new Set(theirs.optionIds)
			return {
				kind: "overlap",
				shared: mine.optionIds.filter((id) => theirSet.has(id)).length,
				total: theirs.optionIds.length,
			}
		})
		.with(
			"single",
			(): Alignment =>
				mine.optionIds[0] === theirs.optionIds[0]
					? { kind: "same" }
					: { kind: "different" },
		)
		.exhaustive()
}

// `theirPick` is the inviter's pick as the app states it ("Over 52.5", a
// player's name), and `formatNumber` formats a guess gap the way the
// question formats guesses.
export function alignmentText(
	alignment: Alignment,
	inviter: string,
	theirPick: string,
	formatNumber: (value: number) => string,
): string {
	return match(alignment)
		.with({ kind: "same" }, () => `You and @${inviter} both took ${theirPick}.`)
		.with(
			{ kind: "different" },
			() => `You went the other way from @${inviter}, who took ${theirPick}.`,
		)
		.with({ kind: "overlap" }, ({ shared, total }) =>
			shared === 0
				? `None of your picks match @${inviter}'s.`
				: `You and @${inviter} share ${shared} of ${total} picks.`,
		)
		.with({ kind: "gap" }, ({ gap }) =>
			gap === 0
				? `You and @${inviter} guessed the same number: ${theirPick}.`
				: `Your guess is ${formatNumber(gap)} away from @${inviter}'s ${theirPick}.`,
		)
		.exhaustive()
}
