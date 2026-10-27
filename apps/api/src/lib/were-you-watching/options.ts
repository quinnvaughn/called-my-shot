import type { WatchOption, WatchQuestion } from "../../db/schema"
import { shuffled } from "../game-questions/select-templates"
import { played, statOf, type WatchPlayer, type WatchSide } from "./box"

export const OPTION_COUNT = 4

// How many tries a generator gets at three distinct wrong answers before it
// gives the question up.
const TRIES = 200

const randomInt = (rng: () => number, min: number, max: number) =>
	min + Math.floor(rng() * (max - min + 1))

export const pickOne = <T>(items: T[], rng: () => number): T | undefined =>
	items[Math.floor(rng() * items.length)]

const playerOption = (player: WatchPlayer): WatchOption => ({
	label: player.name,
	playerId: player.playerId,
})

// The right option among the wrong ones, in a random order.
export function placeAnswer(
	correct: WatchOption,
	wrong: WatchOption[],
	rng: () => number,
): { options: WatchOption[]; answer: number } {
	const options = shuffled([correct, ...wrong], rng)
	return { options, answer: options.indexOf(correct) }
}

type Base = { template: string; prompt: string; rng: () => number }

// A number to pick from four, the wrong three within `spread` of it and at
// least `minGap` apart from each other and from it, shown smallest first.
export function numberQuestion(
	args: Base & {
		answer: number
		spread: number
		minGap?: number
		min?: number
		reveal: string
	},
): WatchQuestion | null {
	const { answer, spread, minGap = 1, min = 0, rng } = args
	const values = [answer]
	for (let i = 0; i < TRIES && values.length < OPTION_COUNT; i++) {
		const value = answer + randomInt(rng, -spread, spread)
		if (value < min) continue
		if (values.some((v) => Math.abs(v - value) < minGap)) continue
		values.push(value)
	}
	if (values.length < OPTION_COUNT) return null
	const sorted = [...values].sort((a, b) => a - b)
	return {
		template: args.template,
		prompt: args.prompt,
		options: sorted.map((v) => ({ label: String(v), playerId: null })),
		answer: sorted.indexOf(answer),
		reveal: args.reveal,
	}
}

// Who on a side had the most of a stat. Only asked when one player had
// strictly the most: a tie has no single answer. The wrong three are the
// next three down.
export function leaderQuestion(
	args: Base & {
		side: WatchSide
		key: string
		minValue?: number
		reveal: (leader: WatchPlayer, value: number) => string
	},
): WatchQuestion | null {
	const pool = played(args.side)
		.flatMap((player) => {
			const value = statOf(player, args.key)
			return value === null ? [] : [{ player, value }]
		})
		.sort((a, b) => b.value - a.value)
	const [top, second] = pool
	if (pool.length < OPTION_COUNT || !top || !second) return null
	if (top.value <= second.value || top.value < (args.minValue ?? 1)) return null
	const { options, answer } = placeAnswer(
		playerOption(top.player),
		pool.slice(1, OPTION_COUNT).map((e) => playerOption(e.player)),
		args.rng,
	)
	return {
		template: args.template,
		prompt: args.prompt,
		options,
		answer,
		reveal: args.reveal(top.player, top.value),
	}
}

// "Which of these ...": one player who did it among three who didn't.
export function presenceQuestion(
	args: Base & {
		candidates: WatchPlayer[]
		did: (player: WatchPlayer) => boolean
		reveal: (player: WatchPlayer) => string
	},
): WatchQuestion | null {
	const yes = args.candidates.filter(args.did)
	const no = args.candidates.filter((p) => !args.did(p))
	const pick = pickOne(yes, args.rng)
	if (!pick || no.length < OPTION_COUNT - 1) return null
	const { options, answer } = placeAnswer(
		playerOption(pick),
		shuffled(no, args.rng)
			.slice(0, OPTION_COUNT - 1)
			.map(playerOption),
		args.rng,
	)
	return {
		template: args.template,
		prompt: args.prompt,
		options,
		answer,
		reveal: args.reveal(pick),
	}
}

// A stat line to pick from four. Each wrong line moves one or two of the
// numbers by up to that number's spread; a spread of 0 holds it fixed.
export function lineQuestion(
	args: Base & {
		values: number[]
		spreads: number[]
		format: (values: number[]) => string
		valid?: (values: number[]) => boolean
		reveal: string
	},
): WatchQuestion | null {
	const { values, spreads, format, rng } = args
	const movable = spreads.flatMap((s, i) => (s > 0 ? [i] : []))
	if (movable.length === 0) return null
	const correct = format(values)
	const labels = new Set([correct])
	for (let i = 0; i < TRIES && labels.size < OPTION_COUNT; i++) {
		const next = [...values]
		const moves = Math.min(movable.length, randomInt(rng, 1, 2))
		for (const index of shuffled(movable, rng).slice(0, moves)) {
			const spread = spreads[index] ?? 0
			const delta = randomInt(rng, 1, spread) * (rng() < 0.5 ? -1 : 1)
			next[index] = (next[index] ?? 0) + delta
		}
		if (next.some((v) => v < 0)) continue
		if (args.valid && !args.valid(next)) continue
		labels.add(format(next))
	}
	if (labels.size < OPTION_COUNT) return null
	const [, ...wrong] = [...labels]
	const { options, answer } = placeAnswer(
		{ label: correct, playerId: null },
		wrong.map((label) => ({ label, playerId: null })),
		rng,
	)
	return {
		template: args.template,
		prompt: args.prompt,
		options,
		answer,
		reveal: args.reveal,
	}
}

// Fixed choices in their natural order (the four quarters), one of them
// right.
export function choiceQuestion(
	args: Omit<Base, "rng"> & {
		labels: string[]
		answer: number
		reveal: string
	},
): WatchQuestion | null {
	if (args.labels.length !== OPTION_COUNT) return null
	return {
		template: args.template,
		prompt: args.prompt,
		options: args.labels.map((label) => ({ label, playerId: null })),
		answer: args.answer,
		reveal: args.reveal,
	}
}
